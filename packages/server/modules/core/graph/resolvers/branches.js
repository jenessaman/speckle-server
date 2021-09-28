'use strict'

const appRoot = require( 'app-root-path' )
const { ForbiddenError, UserInputError, ApolloError, withFilter } = require( 'apollo-server-express' )
const { authorizeResolver, pubsub } = require( `${appRoot}/modules/shared` )
const _ = require( 'lodash' )

const {
  createBranch,
  updateBranch,
  getBranchById,
  getBranchesByStreamId,
  getBranchByNameAndStreamId,
  deleteBranchById
} = require( '../../services/branches' )

const { getUserById } = require( '../../services/users' )
const { getCommitsByBranchName } = require( '../../services/commits' )
const { getObject } = require( '../../services/objects' )
const { saveActivity } = require( `${appRoot}/modules/activitystream/services` )

// subscription events
const BRANCH_CREATED = 'BRANCH_CREATED'
const BRANCH_UPDATED = 'BRANCH_UPDATED'
const BRANCH_DELETED = 'BRANCH_DELETED'

module.exports = {
  Query: {},
  Stream: {

    async branches( parent, args, context, info ) {
      if ( args.limit && args.limit > 100 )
        throw new UserInputError( 'Cannot return more than 100 items, please use pagination.' )
      let { items, cursor, totalCount } = await getBranchesByStreamId( { streamId: parent.id, limit: args.limit, cursor: args.cursor } )

      return { totalCount, cursor, items }
    },

    async branch( parent, args, context, info ) {
      return await getBranchByNameAndStreamId( { streamId: parent.id, name: args.name } )
    },

    async globals( parent, args, context, info ) {
      let branches = await getBranchesByStreamId( { streamId: parent.id } )
      if ( !branches.items.some( b => b.name === 'globals' ) ) 
        return null

      let { commits, cursor } = await getCommitsByBranchName( { streamId: parent.id, branchName: 'globals', limit: 1 } )
      if ( !commits ){
        return null
      }

      let globalsObject = commits[0].referencedObject
      let obj = await getObject( { streamId: parent.id, objectId: globalsObject } )
      if ( !obj ) 
        return null
      obj.streamId = parent.id

      let filtered = _.omit( obj.data, 'totalChildrenCount' )
      filtered = _.omit( filtered, 'speckle_type' )
      filtered = _.omit( filtered, 'id' )
      let items = filtered
      let totalCount = Object.keys( filtered ).length

      return { totalCount, items }
    },

  },
  Branch: {

    async author( parent, args, context, info ) {
      if ( parent.authorId && context.auth )
        return await getUserById( { userId: parent.authorId } )
      else return null
    }

  },
  Mutation: {

    async branchCreate( parent, args, context, info ) {
      await authorizeResolver( context.userId, args.branch.streamId, 'stream:contributor' )

      let id = await createBranch( { ...args.branch, authorId: context.userId } )

      if ( id ) {
        await saveActivity( {
          streamId: args.branch.streamId,
          resourceType: 'branch',
          resourceId: id,
          actionType: 'branch_create',
          userId: context.userId,
          info: { branch: { ...args.branch, id: id } },
          message: `Branch created: '${args.branch.name}' (${id})`
        } )
        await pubsub.publish( BRANCH_CREATED, {
          branchCreated: { ...args.branch, id: id, authorId: context.userId },
          streamId: args.branch.streamId
        } )
      }

      return id
    },

    async branchUpdate( parent, args, context, info ) {
      await authorizeResolver( context.userId, args.branch.streamId, 'stream:contributor' )

      let oldValue = await getBranchById( { id: args.branch.id } )
      if ( !oldValue ) {
        throw new ApolloError( 'Branch not found.' )
      }

      if ( oldValue.streamId !== args.branch.streamId )
        throw new ForbiddenError( 'The branch id and stream id do not match. Please check your inputs.' )

      let updated = await updateBranch( { ...args.branch } )

      if ( updated ) {
        await saveActivity( {
          streamId: args.branch.streamId,
          resourceType: 'branch',
          resourceId: args.branch.id,
          actionType: 'branch_update',
          userId: context.userId,
          info: { old: oldValue, new: args.branch },
          message: `Branch metadata changed: '${args.branch.name}' (${args.branch.id})`
        } )
        await pubsub.publish( BRANCH_UPDATED, {
          branchUpdated: { ...args.branch },
          streamId: args.branch.streamId,
          branchId: args.branch.id
        } )
      }

      return updated
    },

    async branchDelete( parent, args, context, info ) {
      let role = await authorizeResolver( context.userId, args.branch.streamId, 'stream:contributor' )

      let branch = await getBranchById( { id: args.branch.id } )
      if ( !branch ) {
        throw new ApolloError( 'Branch not found.' )
      }

      if ( branch.streamId !== args.branch.streamId )
        throw new ForbiddenError( 'The branch id and stream id do not match. Please check your inputs.' )

      if ( branch.authorId !== context.userId && role !== 'stream:owner' )
        throw new ForbiddenError( 'Only the branch creator or stream owners are allowed to delete branches.' )

      let deleted = await deleteBranchById( { id: args.branch.id, streamId: args.branch.streamId } )
      if ( deleted ) {
        await saveActivity( {
          streamId: args.branch.streamId,
          resourceType: 'branch',
          resourceId: args.branch.id,
          actionType: 'branch_delete',
          userId: context.userId,
          info: { branch: { ...args.branch, name: branch.name } },
          message: `Branch deleted: '${branch.name}' (${args.branch.id})`
        } )
        await pubsub.publish( BRANCH_DELETED, { branchDeleted: { ...args.branch }, streamId: args.branch.streamId } )
      }

      return deleted
    }

  },
  Subscription: {

    branchCreated: {
      subscribe: withFilter( () => pubsub.asyncIterator( [ BRANCH_CREATED ] ),
        async ( payload, variables, context ) => {
          await authorizeResolver( context.userId, payload.streamId, 'stream:reviewer' )

          return payload.streamId === variables.streamId
        } )
    },

    branchUpdated: {
      subscribe: withFilter( () => pubsub.asyncIterator( [ BRANCH_UPDATED ] ),
        async ( payload, variables, context ) => {
          await authorizeResolver( context.userId, payload.streamId, 'stream:reviewer' )

          let streamMatch = payload.streamId === variables.streamId
          if ( streamMatch && variables.branchId ) {
            return payload.branchId === variables.branchId
          }

          return streamMatch
        } )
    },

    branchDeleted: {
      subscribe: withFilter( () => pubsub.asyncIterator( [ BRANCH_DELETED ] ),
        async ( payload, variables, context ) => {
          await authorizeResolver( context.userId, payload.streamId, 'stream:reviewer' )

          return payload.streamId === variables.streamId
        } )
    }

  }
}
