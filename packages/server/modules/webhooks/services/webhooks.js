'use strict'

const appRoot = require( 'app-root-path' )
const knex = require( `${appRoot}/db/knex` )
const crs = require( 'crypto-random-string' )
const { capture } = require(`${appRoot}/logging/posthogHelper`)

const WebhooksConfig = ( ) => knex( 'webhooks_config' )
const WebhooksEvents = ( ) => knex( 'webhooks_events' )
const Users = ( ) => knex( 'users' )

const { getServerInfo } = require( '../../core/services/generic' )
const { getStream } = require( '../../core/services/streams' )

let MAX_STREAM_WEBHOOKS = 100

module.exports = {

  async createWebhook( { streamId, url, description, secret, enabled, triggers } ) {
    let streamWebhookCount = await module.exports.getStreamWebhooksCount( { streamId } )
    if ( streamWebhookCount >= MAX_STREAM_WEBHOOKS ) {
      throw new Error( `Maximum number of webhooks for a stream reached (${MAX_STREAM_WEBHOOKS})` )
    }

    let triggersObj = Object.assign( {}, ...triggers.map( ( x ) => ( { [ x ]: true } ) ) )

    let [ id ] = await WebhooksConfig( ).returning( 'id' ).insert( {
      id: crs( { length: 10 } ),
      streamId,
      url,
      description,
      secret,
      enabled,
      triggers: triggersObj
    } )
    return id
  },

  async getWebhook( { id } ) {
    let webhook = await WebhooksConfig().select( '*' ).where( { id } ).first()
    if ( webhook ) {
      webhook.triggers = Object.keys( webhook.triggers )
    }

    return webhook
  },

  async updateWebhook( { id, url, description, secret, enabled, triggers } ) {
    let fieldsToUpdate = {}
    if ( url !== undefined ) fieldsToUpdate.url = url
    if ( description !== undefined ) fieldsToUpdate.description = description
    if ( secret !== undefined ) fieldsToUpdate.secret = secret
    if ( enabled !== undefined ) fieldsToUpdate.enabled = enabled
    if ( triggers !== undefined ) {
      let triggersObj = Object.assign( {}, ...triggers.map( ( x ) => ( { [ x ]: true } ) ) )
      fieldsToUpdate.triggers = triggersObj
    }

    let [ res ] = await WebhooksConfig( )
      .returning( 'id' )
      .where( { id } )
      .update( fieldsToUpdate )
    return res
  },

  async deleteWebhook( { id } ) {
    return await WebhooksConfig( ).where( { id } ).del( )
  },

  async getStreamWebhooks( { streamId } ) {
    let webhooks = await WebhooksConfig( ).select( '*' ).where( { streamId } )
    for ( let webhook of webhooks ) {
      webhook.triggers = Object.keys( webhook.triggers )
    }

    return webhooks
  },

  async getStreamWebhooksCount( { streamId } ) {
    let [ res ] = await WebhooksConfig( ).count().where( { streamId } )
    return parseInt( res.count )
  },

  async dispatchStreamEvent( { streamId, event, eventPayload } ) {
    // Add server info
    eventPayload.server = await getServerInfo()
    eventPayload.server.canonicalUrl = process.env.CANONICAL_URL
    delete eventPayload.server.id

    // Add stream info
    if ( eventPayload.streamId ) {
      eventPayload.stream = await getStream( { streamId: eventPayload.streamId, userId: eventPayload.userId } )
    }

    // Add user info (except email and pwd)
    if ( eventPayload.userId ) {
      eventPayload.user = await Users( ).where( { id: eventPayload.userId } ).select( '*' ).first( )
      if ( eventPayload.user ) {
        delete eventPayload.user.passwordDigest
        delete eventPayload.user.email
      }
    }

    capture(event, eventPayload)

    let { rows } = await knex.raw( `
      SELECT * FROM webhooks_config WHERE "streamId" = ?
    `, [ streamId ] )
    for ( let wh of rows ) {
      if ( !wh.enabled )
        continue
      if ( !( event in wh.triggers ) )
        continue

      // Add webhook info (the key `webhook` will be replaced for each webhook configured, before serializing the payload and storing it)
      eventPayload.webhook = wh
      eventPayload.webhook.triggers = Object.keys( eventPayload.webhook.triggers )
      delete eventPayload.webhook.secret

      await WebhooksEvents( ).insert( {
        id: crs( { length: 20 } ),
        webhookId: wh.id,
        payload: JSON.stringify( eventPayload )
      } )
    }
  },

  async getLastWebhookEvents( { webhookId, limit } ) {
    if ( !limit ) {
      limit = 100
    }

    return await WebhooksEvents( ).select( '*' ).where( { webhookId } ).orderBy( 'lastUpdate', 'desc' ).limit( limit )
  },

  async getWebhookEventsCount( { webhookId } ) {
    let [ res ] = await WebhooksEvents().count().where( { webhookId } )

    return parseInt( res.count )
  }
}
