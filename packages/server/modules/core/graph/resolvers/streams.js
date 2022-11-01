'use strict'
const { ApolloError, ForbiddenError, UserInputError } = require('apollo-server-express')
const { withFilter } = require('graphql-subscriptions')

const {
  createStream,
  getStream,
  getStreams,
  updateStream,
  deleteStream,
  getStreamUsers,
  favoriteStream,
  getFavoriteStreamsCollection,
  getActiveUserStreamFavoriteDate,
  getStreamFavoritesCount,
  getOwnedFavoritesCount
} = require('@/modules/core/services/streams')

const {
  authorizeResolver,
  pubsub,
  StreamPubsubEvents,
  validateScopes,
  validateServerRole
} = require(`@/modules/shared`)
const { saveActivity } = require(`@/modules/activitystream/services`)
const { ActionTypes } = require('@/modules/activitystream/helpers/types')
const {
  respectsLimits,
  respectsLimitsByProject,
  sendProjectInfoToValueTrack
} = require('@/modules/core/services/ratelimits')

const { getServerInfo } = require('@/modules/core/services/generic')
const { validateJobNumber } = require('@/modules/jobnumbers/services/jobnumbers')
const {
  getPendingStreamCollaborators
} = require('@/modules/serverinvites/services/inviteRetrievalService')
const { removePrivateFields } = require('@/modules/core/helpers/userHelper')
const {
  removeStreamCollaborator,
  addOrUpdateStreamCollaborator,
  isStreamCollaborator
} = require('@/modules/core/services/streams/streamAccessService')
const { Roles } = require('@/modules/core/helpers/mainConstants')
const {
  getDiscoverableStreams
} = require('@/modules/core/services/streams/discoverableStreams')
const { has } = require('lodash')
const {
  getUserStreamsCount,
  getUserStreams
} = require('@/modules/core/repositories/streams')

// subscription events
const USER_STREAM_ADDED = StreamPubsubEvents.UserStreamAdded
const USER_STREAM_REMOVED = StreamPubsubEvents.UserStreamRemoved
const STREAM_UPDATED = StreamPubsubEvents.StreamUpdated
const STREAM_DELETED = StreamPubsubEvents.StreamDeleted

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}

const _deleteStream = async (parent, args, context) => {
  await saveActivity({
    streamId: args.id,
    resourceType: 'stream',
    resourceId: args.id,
    actionType: ActionTypes.Stream.Delete,
    userId: context.userId,
    info: {},
    message: 'Stream deleted'
  })

  // Notify any listeners on the streamId
  await pubsub.publish(STREAM_DELETED, {
    streamDeleted: { streamId: args.id },
    streamId: args.id
  })

  // Notify all stream users
  const users = await getStreamUsers({ streamId: args.id })

  for (const user of users) {
    await pubsub.publish(USER_STREAM_REMOVED, {
      userStreamRemoved: { id: args.id },
      ownerId: user.id
    })
  }

  // delay deletion by a bit so we can do auth checks
  await sleep(250)

  // Delete after event so we can do authz
  await deleteStream({ streamId: args.id })
  return true
}

const getUserStreamsCore = async (forOtherUser, parent, args) => {
  const totalCount = await getUserStreamsCount({ userId: parent.id, forOtherUser })

  const { cursor, streams } = await getUserStreams({
    userId: parent.id,
    limit: args.limit,
    cursor: args.cursor,
    forOtherUser
  })

  return { totalCount, cursor, items: streams }
}

/**
 * @type {import('@/modules/core/graph/generated/graphql').Resolvers}
 */
module.exports = {
  Query: {
    async stream(_, args, context) {
      const stream = await getStream({ streamId: args.id, userId: context.userId })
      if (!stream) throw new ApolloError('Stream not found')

      await authorizeResolver(context.userId, args.id, 'stream:reviewer')

      const info = await getServerInfo()
      const loggedInUsersOnly = info.loggedInUsersOnly
      if (loggedInUsersOnly || !stream.isPublic)
        await validateServerRole(context, 'server:user')

      if (!stream.isPublic) {
        await validateScopes(context.scopes, 'streams:read')

        const enableGlobalReviewerAccess = info.enableGlobalReviewerAccess
        if (!enableGlobalReviewerAccess)
          await authorizeResolver(context.userId, args.id, 'stream:reviewer')
      }

      return stream
    },

    async streams(parent, args, context) {
      const totalCount = await getUserStreamsCount({
        userId: context.userId,
        searchQuery: args.query
      })

      const { cursor, streams } = await getUserStreams({
        userId: context.userId,
        limit: args.limit,
        cursor: args.cursor,
        searchQuery: args.query
      })
      return { totalCount, cursor, items: streams }
    },

    async discoverableStreams(parent, args) {
      return await getDiscoverableStreams(args)
    },

    async adminStreams(parent, args) {
      if (args.limit && args.limit > 50)
        throw new UserInputError('Cannot return more than 50 items at a time.')

      const { streams, totalCount } = await getStreams({
        offset: args.offset,
        limit: args.limit,
        orderBy: args.orderBy,
        publicOnly: args.publicOnly,
        searchQuery: args.query,
        visibility: args.visibility
      })
      return { totalCount, items: streams }
    }
  },

  Stream: {
    async collaborators(parent) {
      const users = await getStreamUsers({ streamId: parent.id })
      return users
    },

    async pendingCollaborators(parent) {
      const { id: streamId } = parent
      return await getPendingStreamCollaborators(streamId)
    },

    async favoritedDate(parent, _args, ctx) {
      const { id: streamId } = parent
      return await getActiveUserStreamFavoriteDate({ ctx, streamId })
    },

    async favoritesCount(parent, _args, ctx) {
      const { id: streamId } = parent

      return await getStreamFavoritesCount({ ctx, streamId })
    },

    async isDiscoverable(parent) {
      const { isPublic, isDiscoverable } = parent

      if (!isPublic) return false
      return isDiscoverable
    },

    async role(parent, _args, ctx) {
      // If role already resolved, return that
      if (has(parent, 'role')) return parent.role

      // Otherwise resolve it now through a dataloader
      return await ctx.loaders.streams.getRole.load(parent.id)
    }
  },
  User: {
    async streams(parent, args, context) {
      // Return only the user's public streams if parent.id !== context.userId
      const forOtherUser = parent.id !== context.userId
      return await getUserStreamsCore(forOtherUser, parent, args)
    },

    async favoriteStreams(parent, args, context) {
      const { userId } = context
      const { id: requestedUserId } = parent || {}
      const { limit, cursor } = args

      if (userId !== requestedUserId)
        throw new UserInputError("Cannot view another user's favorite streams")

      return await getFavoriteStreamsCollection({ userId, limit, cursor })
    },

    async totalOwnedStreamsFavorites(parent, _args, ctx) {
      const { id: userId } = parent
      return await getOwnedFavoritesCount({ ctx, userId })
    }
  },
  LimitedUser: {
    async streams(parent, args) {
      return await getUserStreamsCore(true, parent, args)
    },
    async totalOwnedStreamsFavorites(parent, _args, ctx) {
      const { id: userId } = parent
      return await getOwnedFavoritesCount({ ctx, userId })
    }
  },
  Mutation: {
    async streamCreate(parent, args, context) {
      const info = await getServerInfo()
      const requireJobNumber = info.requireJobNumberToCreateStreams
      if (requireJobNumber) {
        if (!args.stream.jobNumber) {
          throw new Error(
            'A job number is required to create a stream on this server. Please provide one.'
          )
        }
        const isValid = await validateJobNumber(args.stream.jobNumber)
        if (!isValid) {
          throw new Error(
            'Invalid job number. Provided job number must contain digits only (no spaces or dashes), must be 8 digits long (ex. 12345678) and must come from an active project.'
          )
        }
      }

      const rateLimitByProject = process.env.RATE_LIMIT_BY_PROJECT === 'true'
      if (!rateLimitByProject) {
        if (
          !(await respectsLimits({
            action: 'STREAM_CREATE',
            source: context.userId
          }))
        ) {
          throw new Error('Blocked due to rate-limiting. Try again later')
        }
      } else {
        const respectsLimits = await respectsLimitsByProject({
          action: 'STREAM_CREATE',
          source: args.stream.jobNumber
        })
        if (!respectsLimits) {
          throw new Error(
            'Blocked due to rate-limiting (on a per project basis). Please get in touch with your PM regarding use of Speckle on your project.'
          )
        }
      }

      const useValueTrack = process.env.USE_VALUETRACK === 'true'
      if (useValueTrack) {
        await sendProjectInfoToValueTrack({
          action: 'CREATE_ACTION_VALUETRACK',
          source: args.stream.jobNumber,
          userId: context.userId
        })
      }

      const id = await createStream({ ...args.stream, ownerId: context.userId })

      await saveActivity({
        streamId: id,
        resourceType: 'stream',
        resourceId: id,
        actionType: ActionTypes.Stream.Create,
        userId: context.userId,
        info: { stream: args.stream },
        message: `Stream '${args.stream.name}' created`
      })
      await pubsub.publish(USER_STREAM_ADDED, {
        userStreamAdded: { id, ...args.stream },
        ownerId: context.userId
      })
      return id
    },

    async streamUpdate(parent, args, context) {
      await authorizeResolver(context.userId, args.stream.id, 'stream:owner')

      const oldValue = await getStream({ streamId: args.stream.id })

      const { stream } = args
      await updateStream(stream)

      await saveActivity({
        streamId: args.stream.id,
        resourceType: 'stream',
        resourceId: args.stream.id,
        actionType: ActionTypes.Stream.Update,
        userId: context.userId,
        info: { old: oldValue, new: args.stream },
        message: 'Stream metadata changed'
      })
      await pubsub.publish(STREAM_UPDATED, {
        streamUpdated: {
          id: args.stream.id,
          name: args.stream.name,
          description: args.stream.description,
          jobNumber: args.stream.jobNumber
        },
        id: args.stream.id
      })

      return true
    },

    async streamDelete(parent, args, context, info) {
      await authorizeResolver(context.userId, args.id, 'stream:owner')
      return await _deleteStream(parent, args, context, info)
    },

    async streamsDelete(parent, args, context, info) {
      const results = await Promise.all(
        args.ids.map(async (id) => {
          const newArgs = { ...args }
          newArgs.id = id
          return await _deleteStream(parent, newArgs, context, info)
        })
      )
      return results.every((res) => res === true)
    },

    async streamUpdatePermission(parent, args, context) {
      await authorizeResolver(
        context.userId,
        args.permissionParams.streamId,
        'stream:owner'
      )

      const smallestStreamRole = Roles.Stream.Reviewer
      const params = {
        streamId: args.permissionParams.streamId,
        userId: args.permissionParams.userId,
        role: args.permissionParams.role.toLowerCase() || smallestStreamRole
      }

      // We only allow changing roles, not adding access - for that the user must use stream invites
      const isCollaboratorAlready = await isStreamCollaborator(
        params.userId,
        params.streamId
      )
      if (!isCollaboratorAlready) {
        throw new ForbiddenError(
          "Cannot grant permissions to users who aren't collaborators already - invite the user to the stream first"
        )
      }

      await addOrUpdateStreamCollaborator(
        params.streamId,
        params.userId,
        params.role,
        context.userId
      )

      return true
    },

    async streamRevokePermission(parent, args, context) {
      await authorizeResolver(
        context.userId,
        args.permissionParams.streamId,
        'stream:owner'
      )

      await removeStreamCollaborator(
        args.permissionParams.streamId,
        args.permissionParams.userId,
        context.userId
      )

      return true
    },

    async streamFavorite(_parent, args, ctx) {
      const { streamId, favorited } = args
      const { userId } = ctx

      return await favoriteStream({ userId, streamId, favorited })
    },

    async streamLeave(_parent, args, ctx) {
      const { streamId } = args
      const { userId } = ctx

      await removeStreamCollaborator(streamId, userId, userId)

      return true
    }
  },

  Subscription: {
    userStreamAdded: {
      subscribe: withFilter(
        () => pubsub.asyncIterator([USER_STREAM_ADDED]),
        (payload, variables, context) => {
          return payload.ownerId === context.userId
        }
      )
    },

    userStreamRemoved: {
      subscribe: withFilter(
        () => pubsub.asyncIterator([USER_STREAM_REMOVED]),
        (payload, variables, context) => {
          return payload.ownerId === context.userId
        }
      )
    },

    streamUpdated: {
      subscribe: withFilter(
        () => pubsub.asyncIterator([STREAM_UPDATED]),
        async (payload, variables, context) => {
          const info = await getServerInfo()
          const loggedInUsersOnly = info.loggedInUsersOnly
          if (loggedInUsersOnly) await validateServerRole(context, 'server:user')
          const enableGlobalReviewerAccess = info.enableGlobalReviewerAccess
          if (!enableGlobalReviewerAccess)
            await authorizeResolver(context.userId, payload.id, 'stream:reviewer')
          return payload.id === variables.streamId
        }
      )
    },

    streamDeleted: {
      subscribe: withFilter(
        () => pubsub.asyncIterator([STREAM_DELETED]),
        async (payload, variables, context) => {
          const info = await getServerInfo()
          const loggedInUsersOnly = info.loggedInUsersOnly
          if (loggedInUsersOnly) await validateServerRole(context, 'server:user')
          const enableGlobalReviewerAccess = info.enableGlobalReviewerAccess
          if (!enableGlobalReviewerAccess)
            await authorizeResolver(context.userId, payload.streamId, 'stream:reviewer')
          return payload.streamId === variables.streamId
        }
      )
    }
  },
  PendingStreamCollaborator: {
    /**
     * @param {import('@/modules/serverinvites/services/inviteRetrievalService').PendingStreamCollaboratorGraphQLType} parent
     */
    async invitedBy(parent, _args, ctx) {
      const { invitedById } = parent
      if (!invitedById) return null

      const user = await ctx.loaders.users.getUser.load(invitedById)
      return user ? removePrivateFields(user) : null
    },
    /**
     * @param {import('@/modules/serverinvites/services/inviteRetrievalService').PendingStreamCollaboratorGraphQLType} parent
     */
    async streamName(parent, _args, ctx) {
      const { streamId } = parent
      const stream = await ctx.loaders.streams.getStream.load(streamId)
      return stream.name
    },
    /**
     * @param {import('@/modules/serverinvites/services/inviteRetrievalService').PendingStreamCollaboratorGraphQLType} parent
     */
    async token(parent, _args, ctx) {
      const authedUserId = ctx.userId
      const targetUserId = parent.user?.id
      const inviteId = parent.inviteId

      // Only returning it for the user that is the pending stream collaborator
      if (!authedUserId || !targetUserId || authedUserId !== targetUserId) {
        return null
      }

      const invite = await ctx.loaders.invites.getInvite.load(inviteId)
      return invite?.token || null
    }
  }
}
