'use strict'
const root = require( 'app-root-path' )
const { ApolloError, AuthenticationError, UserInputError } = require( 'apollo-server-express' )
const { createUser, getUser, getUserRole, updateUser, deleteUser, validatePasssword } = require( '../../services/users' )
const { createToken, revokeToken, revokeTokenById, validateToken, getUserTokens } = require( '../../services/tokens' )
const { validateServerRole, validateScopes, authorizeResolver } = require( `${root}/modules/shared` )
const setupCheck = require( `${root}/setupcheck` )
const zxcvbn = require( 'zxcvbn' )
module.exports = {
  Query: {
    async _( ) {
      return `Ph'nglui mglw'nafh Cthulhu R'lyeh wgah'nagl fhtagn.`
    },
    async user( parent, args, context, info ) {
      await validateServerRole( context, 'server:user' )
      await validateScopes( context.scopes, 'users:read' )

      if ( !args.id && !context.userId ) {
        throw new UserInputError( 'You must provide an user id.' )
      }

      return await getUser( args.id || context.userId )
    },
    async userPwdStrength( parent, args, context, info ) {
      let res = zxcvbn( args.pwd )
      return { score: res.score, feedback: res.feedback }
    }
  },
  User: {
    async email( parent, args, context, info ) {
      // if it's me, go ahead
      if ( context.userId === parent.id )
        return parent.email

      // otherwise check scopes
      try {
        await validateScopes( context.scopes, 'users:email' )
        return parent.email
      } catch ( err ) {
        return null
      }
    },
    async role( parent, args, context, info ) {
      return await getUserRole( parent.id )
    }
  },
  Mutation: {
    async userEdit( parent, args, context, info ) {
      await validateServerRole( context, 'server:user' )
      await updateUser( context.userId, args.user )
      return true
    },
    async userCreate( parent, args, context, info ) {
      let setupComplete = await setupCheck( )
      if ( setupComplete && process.env.STRATEGY_LOCAL !== 'true' )
        throw new ApolloError( 'Registration method not available' )

      let res = zxcvbn( args.user.password )
      
      if ( res.score < 3 ) throw new ApolloError( `Password too weak (score: ${res.score})` )

      let userId = await createUser( args.user )
      let token = await createToken( userId, "Default Token", [ 'streams:read', 'streams:write' ] )
      return token

    },
    async userCreateAdmin( parent, args, context, info ) {
      let setupComplete = await setupCheck( )
      if ( setupComplete ) throw new ApolloError( 'Registration method not available' )

      let userId = await createUser( args.user )
      let token = await createToken( userId, "Default Token", [ 'server:setup', 'profile:read', 'profile:email', 'users:read', 'users:email' ] )

      return token
    }
  }
}