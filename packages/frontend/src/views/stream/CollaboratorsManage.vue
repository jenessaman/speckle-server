<template>
  <v-container fluid style="max-width: 768px">
    <portal to="streamTitleBar">
      <div>
        <v-icon small class="mr-2 hidden-xs-only">mdi-account-multiple</v-icon>
        <span class="space-grotesk">Stream Collaborators</span>
      </div>
    </portal>

    <v-alert v-if="stream.role !== 'stream:owner'" type="warning">
      Your permission level ({{ stream.role }}) is not high enough to edit this stream's
      collaborators.
    </v-alert>
    <v-card v-if="serverInfo" elevation="0" color="transparent" :class="`mb-4 py-4`">
      <v-row align="stretch">
        <v-col v-for="role in roles" :key="role.name" cols="12" sm="4">
          <v-card
            rounded="lg"
            style="height: 100%"
            :class="`${!$vuetify.theme.dark ? 'grey lighten-5' : ''} d-flex flex-column`"
          >
            <v-toolbar style="flex: none" flat>
              <v-toolbar-title class="text-capitalize">
                {{ role.name.split(':')[1] }}s
              </v-toolbar-title>
              <v-spacer></v-spacer>
              <v-badge
                inline
                :content="getRoleCount(role.name)"
                :color="`grey ${$vuetify.theme.dark ? 'darken-1' : 'lighten-1'}`"
              ></v-badge>
            </v-toolbar>
            <v-card-text class="flex-grow-1">{{ role.description }}</v-card-text>
            <v-card-text class="mt-auto">
              <div v-if="role.name === 'stream:reviewer'" class="align-self-end">
                <user-avatar
                  v-for="user in reviewers"
                  :id="user.id"
                  :key="user.id"
                  :avatar="user.avatar"
                  :name="user.name"
                  :size="30"
                />
                <span v-if="reviewers.length === 0">No users with this role.</span>
              </div>
              <div v-if="role.name === 'stream:contributor'">
                <user-avatar
                  v-for="user in contributors"
                  :id="user.id"
                  :key="user.id"
                  :avatar="user.avatar"
                  :name="user.name"
                  :size="30"
                />
                <span v-if="contributors.length === 0">No users with this role.</span>
              </div>
              <div v-if="role.name === 'stream:owner'">
                <user-avatar
                  v-for="user in owners"
                  :id="user.id"
                  :key="user.id"
                  :avatar="user.avatar"
                  :name="user.name"
                  :size="30"
                />
              </div>
            </v-card-text>
          </v-card>
        </v-col>
      </v-row>
    </v-card>
    <v-card
      v-if="stream"
      :loading="loading"
      elevation="0"
      rounded="lg"
      :class="`${!$vuetify.theme.dark ? 'grey lighten-5' : ''}`"
    >
      <template slot="progress">
        <v-progress-linear indeterminate></v-progress-linear>
      </template>

      <v-toolbar
        v-if="stream.role === 'stream:owner'"
        flat
        :class="`${!$vuetify.theme.dark ? 'grey lighten-4' : ''}`"
      >
        <v-toolbar-title>
          <v-icon small class="mr-2">mdi-account-plus</v-icon>
          <span class="d-inline-block">Add collaborators</span>
        </v-toolbar-title>
      </v-toolbar>

      <v-card-text v-if="stream.role === 'stream:owner'">
        <p>
          Default role for new collaborators is that of a stream contributor. You will be able to
          change it after they're added.
        </p>
        <v-text-field v-model="search" label="Search for a user" persistent-hint />
        <div v-if="$apollo.loading">Searching.</div>
        <v-list
          v-if="search && search.length >= 3 && userSearch && userSearch.items"
          dense
          one-line
          class="px-0 mx-0 transparent"
        >
          <v-list-item v-if="filteredSearchResults.length === 0" class="px-0 mx-0">
            <v-list-item-content>
              <v-list-item-title>
                No users found. Note: you can search by name and email.
              </v-list-item-title>
            </v-list-item-content>
          </v-list-item>
          <v-list-item v-if="filteredSearchResults.length === 0" class="px-0 mx-0">
            <v-list-item-action>
              <v-btn color="primary" @click="showStreamInviteDialog">Invite {{ search }}</v-btn>
            </v-list-item-action>
          </v-list-item>
          <v-list-item
            v-for="item in filteredSearchResults"
            v-else
            :key="item.id"
            @click="addCollab(item)"
          >
            <v-list-item-avatar>
              <user-avatar
                :id="item.id"
                :name="item.name"
                :avatar="item.avatar"
                :size="25"
                class="ml-1"
              ></user-avatar>
            </v-list-item-avatar>
            <v-list-item-content>
              <v-list-item-title>{{ item.name }}</v-list-item-title>
              <v-list-item-subtitle>
                {{ item.company ? item.company : 'no company info' }}
              </v-list-item-subtitle>
            </v-list-item-content>
            <v-list-item-action>
              <v-icon>mdi-plus</v-icon>
            </v-list-item-action>
          </v-list-item>
        </v-list>
      </v-card-text>
      <stream-invite-dialog ref="streamInviteDialog" :stream-id="stream.id" :text="search" />
    </v-card>

    <v-card
      v-if="stream"
      :loading="loading"
      elevation="0"
      rounded="lg"
      :class="`mt-5 ${!$vuetify.theme.dark ? 'grey lighten-5' : ''}`"
    >
      <v-toolbar
        v-if="stream.role === 'stream:owner'"
        flat
        :class="`${!$vuetify.theme.dark ? 'grey lighten-4' : ''}`"
      >
        <v-toolbar-title>
          <v-icon small class="mr-2">mdi-account-group</v-icon>
          <span class="d-inline-block">Edit roles</span>
        </v-toolbar-title>
      </v-toolbar>
      <v-card-text class="px-0">
        <p v-if="collaborators.length === 0" class="ml-4">
          There are no collaborators on this stream. Speckle is more fun in multiplayer mode, so
          invite someone!
        </p>
        <v-list v-else class="transparent">
          <v-list-item v-for="user in collaborators" :key="user.id" two-lines>
            <v-list-item-icon>
              <user-avatar :id="user.id" :avatar="user.avatar" :name="user.name" :size="42" />
            </v-list-item-icon>
            <v-list-item-content>
              <v-list-item-title class="font-weight-bold">{{ user.name }}</v-list-item-title>
              <v-list-item-subtitle>
                <v-select
                  v-model="user.role"
                  item-value="name"
                  :items="roles"
                  class="py-0 my-0"
                  :disabled="stream.role !== 'stream:owner'"
                  @change="setUserPermissions(user)"
                >
                  <template #selection="{ item }">
                    {{ item.name }}
                  </template>
                  <template #item="{ item }">
                    <div class="pa-2">
                      <p class="pa-0 ma-0">{{ item.name }}</p>
                      <p class="caption pa-0 ma-0 grey--text" style="max-width: 300px">
                        {{ item.description }}
                      </p>
                    </div>
                  </template>
                </v-select>
              </v-list-item-subtitle>
            </v-list-item-content>
            <v-list-item-action>
              <v-btn
                icon
                small
                color="error"
                :disabled="stream.role !== 'stream:owner'"
                @click="removeUser(user)"
              >
                <v-icon>mdi-close</v-icon>
              </v-btn>
            </v-list-item-action>
          </v-list-item>
        </v-list>
      </v-card-text>
    </v-card>
  </v-container>
</template>
<script>
import gql from 'graphql-tag'
import serverQuery from '@/graphql/server.gql'
import streamCollaboratorsQuery from '@/graphql/streamCollaborators.gql'
import userSearchQuery from '@/graphql/userSearch.gql'
import UserAvatar from '@/components/UserAvatar'
import StreamInviteDialog from '@/components/dialogs/StreamInviteDialog'

export default {
  components: { UserAvatar, StreamInviteDialog },
  data: () => ({
    search: '',
    selectedUsers: null,
    selectedRole: null,
    userSearch: { items: [] },
    serverInfo: { roles: [] },
    loading: false
  }),
  apollo: {
    stream: {
      prefetch: true,
      query: streamCollaboratorsQuery,
      variables() {
        return {
          id: this.$route.params.streamId
        }
      }
    },
    userSearch: {
      query: userSearchQuery,
      variables() {
        return {
          query: this.search,
          limit: 25
        }
      },
      skip() {
        return !this.search || this.search.length < 3
      },
      debounce: 300
    },
    serverInfo: {
      prefetch: true,
      query: serverQuery
    }
  },
  computed: {
    roles() {
      return this.serverInfo.roles.filter((x) => x.resourceTarget === 'streams')
    },
    collaborators() {
      if (!this.stream) return []
      return this.stream.collaborators.filter((user) => user.id !== this.myId)
    },
    reviewers() {
      if (!this.stream) return []
      return this.stream.collaborators.filter((u) => u.role === 'stream:reviewer')
    },
    contributors() {
      if (!this.stream) return []
      return this.stream.collaborators.filter((u) => u.role === 'stream:contributor')
    },
    owners() {
      if (!this.stream) return []
      return this.stream.collaborators.filter((u) => u.role === 'stream:owner')
    },
    filteredSearchResults() {
      if (!this.userSearch) return null
      let users = []
      for (let u of this.userSearch.items) {
        if (u.id === this.myId) continue
        let indx = this.collaborators.findIndex((eu) => eu.id === u.id)
        if (indx === -1) users.push(u)
      }
      return users
    },
    myId() {
      return localStorage.getItem('uuid')
    }
  },
  methods: {
    getRoleCount(role) {
      if (role === 'stream:owner') return this.owners.length || '0'
      if (role === 'stream:contributor') return this.contributors.length || '0'
      if (role === 'stream:reviewer') return this.reviewers.length || '0'
    },
    async removeUser(user) {
      this.loading = true
      this.$matomo && this.$matomo.trackPageView('stream/remove-collaborator')
      try {
        await this.$apollo.mutate({
          mutation: gql`
            mutation streamRevokePermission($params: StreamRevokePermissionInput!) {
              streamRevokePermission(permissionParams: $params)
            }
          `,
          variables: {
            params: {
              streamId: this.stream.id,
              userId: user.id
            }
          }
        })
        let index = this.stream.collaborators.findIndex((u) => u.id === user.id)
        if (index !== -1) {
          this.stream.collaborators.splice(index, 1)
        }
      } catch (e) {
        console.log(e)
      }
      this.$apollo.queries.stream.refetch()
      this.loading = false
    },
    async setUserPermissions(user) {
      this.loading = true
      await this.grantPermissionUser(user)
      this.loading = false
      this.$apollo.queries.stream.refetch()
    },
    async addCollab(user) {
      this.loading = true
      this.search = null
      this.userSearch.items = null
      user.role = 'stream:contributor'
      await this.grantPermissionUser(user)
      this.stream.collaborators.unshift(user)
      this.loading = false
      this.$apollo.queries.stream.refetch()
    },
    async grantPermissionUser(user) {
      this.$matomo && this.$matomo.trackPageView('stream/add-collaborator')
      try {
        await this.$apollo.mutate({
          mutation: gql`
            mutation grantPerm($params: StreamGrantPermissionInput!) {
              streamGrantPermission(permissionParams: $params)
            }
          `,
          variables: {
            params: {
              streamId: this.stream.id,
              userId: user.id,
              role: user.role
            }
          }
        })
      } catch (e) {
        console.log(e)
      }
    },
    showStreamInviteDialog() {
      this.$refs.streamInviteDialog.show()
    }
  }
}
</script>
