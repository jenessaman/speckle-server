<template>
  <v-card>
    <v-card-title class="primary white--text">Create a New App</v-card-title>

    <v-form v-show="!appCreateResult" ref="form" v-model="valid" @submit.prevent="createApp">
      <v-card-text>
        <v-text-field
          v-model="name"
          label="App Name"
          persistent-hint
          hint="The name of your app"
          :rules="nameRules"
          validate-on-blur
          required
          autofocus
        ></v-text-field>
        <v-select
          v-model="selectedScopes"
          persistent-hint
          hint="It's good practice to limit the scopes to the absolute minimum."
          label="Scopes"
          multiple
          required
          validate-on-blur
          :rules="selectedScopesRules"
          :items="parsedScopes"
          chips
          :menu-props="{ maxWidth: 420 }"
        ></v-select>
        <v-text-field
          v-model="redirectUrl"
          persistent-hint
          validate-on-blur
          hint="
            After authentication, the users will be redirected (together with an access token) to this url.
          "
          label="Redirect url"
          :rules="redirectUrlRules"
          required
        ></v-text-field>
        <v-textarea
          v-model="description"
          label="Description"
          persistent-hint
          hint="A short description of your application."
        ></v-textarea>
        <v-card-actions>
          <v-spacer></v-spacer>

          <v-btn text color="error" @click="clearAndClose">Cancel</v-btn>
          <v-btn type="submit" :disabled="!valid">Save</v-btn>
        </v-card-actions>
      </v-card-text>
    </v-form>
    <v-card-text v-show="appCreateResult">
      <div v-if="app" class="text-center my-5">
        <h2 class="mb-5 font-weight-normal">Your new app's details:</h2>
        App Id:
        <code class="subtitle-1 pa-3 my-4">{{ app.id }}</code>
        <v-divider class="mt-5 pt-5" />
        App Secret:
        <code class="subtitle-1 pa-3 my-4">{{ app.secret }}</code>
      </div>
      <v-alert type="info">
        <p>
          <b>Note:</b>
          To authenticate users inside your app, direct them to
          <code style="word-break: break-all">{{ rootUrl }}/authn/verify/{appId}/{challenge}</code>
          , where
          <code>challenge</code>
          is an OAuth2 plain code challenge.
        </p>
      </v-alert>
      <v-btn block color="primary" @click="clearAndClose">Close</v-btn>
    </v-card-text>
  </v-card>
</template>
<script>
import gql from 'graphql-tag'

export default {
  props: {
    show: {
      type: Boolean,
      default: false
    }
  },
  apollo: {
    scopes: {
      prefetch: true,
      query: gql`
        query {
          serverInfo {
            scopes {
              name
              description
            }
          }
        }
      `,
      update: (data) => data.serverInfo.scopes
    },
    app: {
      query: gql`
        query($id: String!) {
          app(id: $id) {
            id
            name
            secret
          }
        }
      `,
      variables() {
        return { id: this.appCreateResult }
      },
      skip() {
        return !this.appCreateResult
      }
    }
  },
  data() {
    return {
      valid: false,
      name: null,
      nameRules: [
        (v) => !!v || 'Name is required',
        (v) => (v && v.length <= 60) || 'Name must be less than 60 characters',
        (v) => (v && v.length >= 3) || 'Name must be at least 3 characters'
      ],
      selectedScopes: [],
      selectedScopesRules: [
        (v) => !!v || 'Scopes are required',
        (v) => (v && v.length >= 1) || 'Scopes are required'
      ],
      redirectUrl: null,
      redirectUrlRules: [
        (v) => !!v || 'Redirect url is required',
        (v) => {
          try {
            // eslint-disable-next-line no-unused-vars
            let x = new URL(v)
            return true
          } catch {
            return 'Url must be valid'
          }
        }
      ],
      logo: null,
      description: null,
      appCreateResult: null
    }
  },
  computed: {
    rootUrl() {
      return window.location.origin
    },
    parsedScopes() {
      if (!this.scopes) return []
      let arr = []
      for (let s of this.scopes) {
        arr.push({ text: s.name, value: s.name })
        arr.push({ header: s.description })
        arr.push({ divider: true })
      }
      return arr
    }
  },
  methods: {
    clearAndClose() {
      this.appCreateResult = null
      this.name = null
      this.selectedScopes = []
      this.$emit('close')
    },
    async createApp() {
      if (!this.$refs.form.validate()) return

      this.$matomo && this.$matomo.trackPageView('user/app/create')
      try {
        let res = await this.$apollo.mutate({
          mutation: gql`
            mutation($app: AppCreateInput!) {
              appCreate(app: $app)
            }
          `,
          variables: {
            app: {
              name: this.name,
              scopes: this.selectedScopes,
              redirectUrl: this.redirectUrl,
              description: this.description
            }
          }
        })
        this.appCreateResult = res.data.appCreate
        this.name = null
        this.selectedScopes = []
        this.$emit('app-added')
      } catch (e) {
        // TODO: how do we catch and display errors?
        console.log(e)
      }
    }
  }
}
</script>
