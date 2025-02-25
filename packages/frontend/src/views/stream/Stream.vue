<template>
  <v-container fluid pa-0 ma-0>
    <!-- Stream Page Navigation Drawer -->
    <v-navigation-drawer
      v-if="!error"
      v-model="streamNav"
      app
      fixed
      clipped
      :permanent="streamNav && !$vuetify.breakpoint.smAndDown"
      :style="`${!$vuetify.breakpoint.xsOnly ? 'left: 56px' : ''}`"
    >
      <!-- Toolbar holds link to stream home page -->
      <v-app-bar
        v-if="stream && $vuetify.breakpoint.smAndDown"
        style="position: absolute; top: 0; width: 100%; z-index: 90"
        elevation="0"
        flat
      >
        <v-toolbar-title>
          <router-link
            v-tooltip="stream.name"
            :to="`/streams/${stream.id}`"
            class="text-decoration-none space-grotesk"
          >
            <v-icon class="mr-2 primary--text" style="font-size: 20px">mdi-folder</v-icon>
            <b>{{ stream.name }}</b>
          </router-link>
        </v-toolbar-title>
      </v-app-bar>

      <!-- <v-skeleton-loader v-else type="list-item-two-line"></v-skeleton-loader> -->

      <!-- Top padding hack -->
      <div v-if="$vuetify.breakpoint.smAndDown" style="display: block; height: 65px"></div>
      <div v-if="!loggedIn" class="px-4 mt-2">
        <v-btn large block color="primary" to="/authn/login">Log In</v-btn>
      </div>
      <!-- Various Stream Details -->
      <v-card v-if="stream" elevation="0" class="pa-1 mb-0" color="transparent">
        <v-card-text class="caption">
          <span v-html="parsedDescription"></span>
          <router-link
            v-if="stream.role === 'stream:owner'"
            :to="`/streams/${$route.params.streamId}/settings`"
            class="text-decoration-none"
          >
            Edit
          </router-link>
          <v-divider class="my-2"></v-divider>
          <div class="caption">
            <span v-tooltip="formatDate(stream.createdAt)">
              Created
              <timeago :datetime="stream.createdAt"></timeago>
            </span>
            ,
            <span v-tooltip="formatDate(stream.updatedAt)">
              Updated
              <timeago :datetime="stream.updatedAt"></timeago>
            </span>
          </div>
          <v-divider class="my-2"></v-divider>
          <div>
            <!-- 
            Note: the current layout fits either:
            - 5 x (collab avatars) + (manage collabs button), or 
            - 4 x (collab avatars) + ( extra collabs info number ) + (manage collabs button) 
            -->
            <user-avatar
              v-for="collab in stream.collaborators.slice(
                0,
                stream.collaborators.length > 5 ? 4 : 5
              )"
              :id="collab.id"
              :key="collab.id"
              :size="30"
              :avatar="collab.avatar"
              :name="collab.name"
            ></user-avatar>
            <v-btn
              v-if="stream.collaborators.length > 5"
              v-tooltip="`${stream.collaborators.length - 4} more collaborators`"
              icon
              :to="`/streams/${stream.id}/collaborators`"
            >
              <span class="text-subtitle-1">+{{ stream.collaborators.length - 4 }}</span>
            </v-btn>
            <v-btn
              v-if="stream.collaborators.length <= 5"
              v-tooltip="'Manage collaborators'"
              icon
              :to="`/streams/${stream.id}/collaborators`"
              class="ml-2"
            >
              <v-avatar>
                <v-icon>mdi-account-plus</v-icon>
              </v-avatar>
            </v-btn>
          </div>

          <!-- Your role: {{ stream.role }} -->
          <v-divider class="my-2"></v-divider>
          <v-chip small class="mr-2">{{ stream.commits.totalCount }} Commits</v-chip>
          <v-chip small class="mr-2">{{ branchesTotalCount }} Branches</v-chip>
        </v-card-text>
      </v-card>

      <!-- Stream menu options -->
      <v-list v-if="stream" style="padding-left: 10px" rounded dense class="mt-0 pt-0">
        <v-list-item link :to="`/streams/${stream.id}`" class="no-overlay">
          <v-list-item-icon>
            <v-icon small>mdi-home</v-icon>
          </v-list-item-icon>
          <v-list-item-content>
            <v-list-item-title>Stream Home</v-list-item-title>
          </v-list-item-content>
        </v-list-item>

        <!-- Branch menu group -->
        <v-list-group v-model="branchMenuOpen" class="my-2">
          <template #activator>
            <v-list-item-icon>
              <v-icon small>mdi-source-branch</v-icon>
            </v-list-item-icon>
            <v-list-item-title>Branches ({{ branchesTotalCount }})</v-list-item-title>
          </template>
          <v-divider class="mb-1"></v-divider>
          <v-list-item
            v-if="stream.role !== 'stream:reviewer'"
            v-tooltip.bottom="'Create a new branch to help categorise your commits.'"
            link
            @click="showNewBranchDialog()"
          >
            <v-list-item-icon>
              <v-icon small style="padding-top: 10px" class="primary--text">mdi-plus-box</v-icon>
            </v-list-item-icon>
            <v-list-item-content>
              <v-list-item-title>New Branch</v-list-item-title>
              <v-list-item-subtitle class="caption">
                Create a new branch to help categorise your commits.
              </v-list-item-subtitle>
            </v-list-item-content>
          </v-list-item>

          <v-list-item
            v-for="(branch, i) in sortedBranches"
            v-if="!$apollo.queries.branchQuery.loading"
            :key="i"
            link
            :to="`/streams/${stream.id}/branches/${branch.name}`"
          >
            <v-list-item-icon>
              <v-icon v-if="branch.name !== 'main'" small style="padding-top: 10px">
                mdi-source-branch
              </v-icon>
              <v-icon v-else small style="padding-top: 10px" class="primary--text">mdi-star</v-icon>
            </v-list-item-icon>
            <v-list-item-content>
              <v-list-item-title>
                {{ branch.name }} ({{ branch.commits.totalCount }})
              </v-list-item-title>
              <v-list-item-subtitle class="caption">
                {{ branch.description ? branch.description : 'no description' }}
              </v-list-item-subtitle>
            </v-list-item-content>
          </v-list-item>
          <v-skeleton-loader v-else type="list-item-two-line"></v-skeleton-loader>
          <v-divider class="mb-2"></v-divider>
        </v-list-group>

        <!-- Other menu items go here -->

        <v-list-item link :to="`/streams/${stream.id}/globals`">
          <v-list-item-icon>
            <v-icon small>mdi-earth</v-icon>
          </v-list-item-icon>
          <v-list-item-content>
            <v-list-item-title>
              {{ `Globals (${globalsTotalCount})` }}
            </v-list-item-title>
          </v-list-item-content>
        </v-list-item>

        <v-list-item link :to="`/streams/${stream.id}/uploads`">
          <v-list-item-icon>
            <v-icon small>mdi-arrow-up</v-icon>
          </v-list-item-icon>
          <v-list-item-content>
            <v-list-item-title>Import IFC</v-list-item-title>
          </v-list-item-content>
        </v-list-item>

        <v-list-item link :to="`/streams/${stream.id}/webhooks`">
          <v-list-item-icon>
            <v-icon small>mdi-webhook</v-icon>
          </v-list-item-icon>
          <v-list-item-content>
            <v-list-item-title>Webhooks</v-list-item-title>
          </v-list-item-content>
        </v-list-item>

        <v-list-item link :to="`/streams/${stream.id}/collaborators`">
          <v-list-item-icon>
            <v-icon small>mdi-account-group</v-icon>
          </v-list-item-icon>
          <v-list-item-content>
            <v-list-item-title>Collaborators</v-list-item-title>
          </v-list-item-content>
        </v-list-item>

        <v-list-item link :to="`/streams/${stream.id}/settings`">
          <v-list-item-icon>
            <v-icon small>mdi-cog</v-icon>
          </v-list-item-icon>
          <v-list-item-content>
            <v-list-item-title>Settings</v-list-item-title>
          </v-list-item-content>
        </v-list-item>
      </v-list>
    </v-navigation-drawer>

    <!-- Stream Page App Bar -->
    <v-app-bar
      v-if="!error"
      app
      :style="`${!$vuetify.breakpoint.xsOnly ? 'padding-left: 56px' : ''}`"
      flat
      clipped-left
    >
      <v-app-bar-nav-icon v-if="true || !streamNav" @click="streamNav = !streamNav">
        <!-- <v-icon v-if="streamNav">mdi-chevron-left</v-icon> -->
      </v-app-bar-nav-icon>
      <v-toolbar-title class="pl-0">
        <router-link
          v-if="stream"
          v-show="true || (!streamNav && !$vuetify.breakpoint.smAndDown)"
          class="text-decoration-none space-grotesk"
          :to="`/streams/${stream.id}`"
        >
          <b>{{ stream.name }}</b>
        </router-link>
        <span v-show="true || (!streamNav && !$vuetify.breakpoint.smAndDown)" class="mx-2">/</span>
        <portal-target name="streamTitleBar" slim style="display: inline-block">
          <!-- child routes can teleport things here -->
        </portal-target>
      </v-toolbar-title>
      <v-spacer></v-spacer>
      <portal-target name="streamActionsBar">
        <!-- child routes can teleport buttons here -->
      </portal-target>
      <v-toolbar-items style="margin-right: -20px">
        <v-btn v-if="!loggedIn && stream && !streamNav" large color="primary" to="/authn/login">
          Log In
        </v-btn>
        <v-btn
          v-if="loggedIn && stream"
          v-tooltip="'Share this stream'"
          elevation="0"
          @click="openShareStreamDialog()"
        >
          <v-icon v-if="!stream.isPublic" small class="mr-2 grey--text">mdi-lock</v-icon>
          <v-icon v-else small class="mr-2 grey--text">mdi-lock-open</v-icon>
          <v-icon small class="mr-2">mdi-share-variant</v-icon>
          <span class="hidden-md-and-down">Share</span>
        </v-btn>
      </v-toolbar-items>
    </v-app-bar>

    <!-- Stream Child Routes -->
    <v-container
      v-if="!error"
      :style="`${!$vuetify.breakpoint.xsOnly ? 'padding-left: 56px;' : ''}`"
      :class="`${$vuetify.breakpoint.xsOnly ? 'pl-0' : ''}`"
      fluid
      pt-0
      pr-0
    >
      <transition name="fade">
        <router-view v-if="stream" @refetch-branches="refetchBranches"></router-view>
      </transition>
    </v-container>
    <v-container v-else :style="`${!$vuetify.breakpoint.xsOnly ? 'padding-left: 56px' : ''}`">
      <error-placeholder :error-type="error.toLowerCase().includes('not found') ? '404' : 'access'">
        <h2>{{ error }}</h2>
      </error-placeholder>
    </v-container>

    <branch-new-dialog ref="branchDialog" @refetch-branches="refetchBranches" />

    <v-dialog v-model="shareStream" max-width="600" :fullscreen="$vuetify.breakpoint.xsOnly">
      <v-card>
        <v-sheet color="primary">
          <v-toolbar color="primary" dark flat>
            <v-app-bar-nav-icon style="pointer-events: none">
              <v-icon>mdi-share-variant</v-icon>
            </v-app-bar-nav-icon>
            <v-toolbar-title>Engage Multiplayer Mode!</v-toolbar-title>
            <v-spacer></v-spacer>
            <v-btn icon @click="shareStream = false"><v-icon>mdi-close</v-icon></v-btn>
          </v-toolbar>
          <v-card-text class="mt-0 mb-0 px-2">
            <v-text-field
              ref="streamUrl"
              dark
              filled
              rounded
              hint="Stream url copied to clipboard. Use it in a connector, or just share it with colleagues!"
              style="color: blue"
              prepend-inner-icon="mdi-folder"
              :value="streamUrl"
              @focus="copyToClipboard"
            ></v-text-field>
            <v-text-field
              v-if="$route.params.branchName"
              ref="branchUrl"
              dark
              filled
              rounded
              hint="Branch url copied to clipboard. Most connectors can receive the latest commit from a branch by using this url."
              style="color: blue"
              prepend-inner-icon="mdi-source-branch"
              :value="streamUrl + '/branches/' + $route.params.branchName"
              @focus="copyToClipboard"
            ></v-text-field>
            <v-text-field
              v-if="$route.params.commitId"
              ref="commitUrl"
              dark
              filled
              rounded
              hint="Commit url copied to clipboard. Most connectors can receive a specific commit by using this url."
              style="color: blue"
              prepend-inner-icon="mdi-source-commit"
              :value="streamUrl + '/commits/' + $route.params.commitId"
              @focus="copyToClipboard"
            ></v-text-field>
          </v-card-text>
        </v-sheet>
        <v-sheet
          v-if="stream"
          :class="`${!$vuetify.theme.dark ? 'grey lighten-4' : 'grey darken-4'}`"
        >
          <v-toolbar v-if="stream.role === 'stream:owner'" class="transparent" rounded flat>
            <v-app-bar-nav-icon style="pointer-events: none">
              <v-icon>{{ stream.isPublic ? 'mdi-lock-open' : 'mdi-lock' }}</v-icon>
            </v-app-bar-nav-icon>
            <v-toolbar-title>
              {{ stream.isPublic ? 'Public stream' : 'Private stream' }}
            </v-toolbar-title>
            <v-spacer></v-spacer>
            <v-switch
              v-model="stream.isPublic"
              inset
              class="mt-4"
              :loading="swapPermsLoading"
              @click="changeVisibility"
            ></v-switch>
          </v-toolbar>
          <v-card-text v-if="stream.isPublic" class="pt-2">
            This stream is public. This means that anyone with the link can view and read data from
            it.
          </v-card-text>
          <v-card-text v-if="!stream.isPublic" class="pt-2 pb-2">
            This stream is private. This means that only collaborators can access it.
          </v-card-text>
        </v-sheet>
        <v-sheet v-if="stream">
          <v-toolbar
            v-tooltip="
              `${
                stream.role !== 'stream:owner'
                  ? 'You do not have the right access level (' +
                    stream.role +
                    ') to add collaborators.'
                  : ''
              }`
            "
            flat
          >
            <v-app-bar-nav-icon style="pointer-events: none">
              <v-icon>mdi-account-group</v-icon>
            </v-app-bar-nav-icon>
            <v-toolbar-title>
              Collaborators
              <user-avatar
                v-for="collab in stream.collaborators.slice(
                  0,
                  stream.collaborators.length > 5 ? 4 : 5
                )"
                :id="collab.id"
                :key="collab.id"
                :size="20"
                :avatar="collab.avatar"
                :name="collab.name"
              ></user-avatar>
            </v-toolbar-title>
            <v-spacer></v-spacer>
            <v-btn
              color="primary"
              text
              rounded
              :to="`/streams/${$route.params.streamId}/collaborators`"
              :disabled="stream.role !== 'stream:owner'"
            >
              Manage
            </v-btn>
          </v-toolbar>
        </v-sheet>
        <v-sheet
          v-if="stream"
          :xxxclass="`${!$vuetify.theme.dark ? 'grey lighten-4' : 'grey darken-4'}`"
        >
          <v-toolbar
            v-if="!stream.isPublic"
            v-tooltip="
              `${
                stream.role !== 'stream:owner'
                  ? 'You do not have the right access level (' +
                    stream.role +
                    ') to invite people to this stream.'
                  : ''
              }`
            "
            flat
            class="transparent"
          >
            <v-app-bar-nav-icon style="pointer-events: none">
              <v-icon>mdi-email</v-icon>
            </v-app-bar-nav-icon>
            <v-toolbar-title>Missing someone?</v-toolbar-title>
            <v-spacer></v-spacer>
            <v-btn
              color="primary"
              text
              rounded
              :disabled="stream.role !== 'stream:owner'"
              @click="showStreamInviteDialog()"
            >
              Send Invite
            </v-btn>
          </v-toolbar>
        </v-sheet>
      </v-card>
    </v-dialog>
    <stream-invite-dialog
      v-if="stream"
      ref="streamInviteDialog"
      :stream-id="$route.params.streamId"
      :stream-name="stream.name"
    />
    <v-snackbar
      v-model="snackbar"
      rounded="pill"
      :timeout="10000"
      style="z-index: 10000"
      :color="`${$vuetify.theme.dark ? 'primary' : 'primary'}`"
    >
      <template v-if="snackbarInfo.type === 'commit'">
        <span>New commit created!</span>
      </template>
      <template v-if="snackbarInfo.type === 'branch'">
        <span>Branch "{{ snackbarInfo.name }}" created!</span>
      </template>

      <template #action="{ attrs }">
        <v-btn color="white" text v-bind="attrs" @click="goToItemAndCloseSnackbar()">View</v-btn>
        <v-btn color="pink" icon v-bind="attrs" @click="snackbar = false">
          <v-icon>mdi-close</v-icon>
        </v-btn>
      </template>
    </v-snackbar>
  </v-container>
</template>

<script>
import gql from 'graphql-tag'

export default {
  name: 'Stream',
  components: {
    UserAvatar: () => import('@/components/UserAvatar'),
    ErrorPlaceholder: () => import('@/components/ErrorPlaceholder'),
    BranchNewDialog: () => import('@/components/dialogs/BranchNewDialog'),
    StreamInviteDialog: () => import('@/components/dialogs/StreamInviteDialog')
  },
  data() {
    return {
      streamNav: true,
      error: '',
      snackbar: false,
      snackbarInfo: {},
      editStreamDialog: false,
      shareStream: false,
      branchMenuOpen: false,
      swapPermsLoading: false
    }
  },
  apollo: {
    stream: {
      query: gql`
        query Stream($id: String!) {
          stream(id: $id) {
            id
            name
            role
            createdAt
            updatedAt
            description
            isPublic
            commits {
              totalCount
            }
            collaborators {
              id
              name
              role
              company
              avatar
            }
            globals {
              totalCount
            }
          }
        }
      `,
      variables() {
        return {
          id: this.$route.params.streamId
        }
      },
      error(err) {
        if (err.message) this.error = err.message.replace('GraphQL error: ', '')
        else this.error = err
      }
    },
    branchQuery: {
      query: gql`
        query Stream($id: String!) {
          branchQuery: stream(id: $id) {
            id
            branches {
              totalCount
              items {
                name
                description
                author {
                  id
                  name
                }
                commits {
                  totalCount
                }
              }
            }
          }
        }
      `,
      variables() {
        return {
          id: this.$route.params.streamId
        }
      },
      update: (data) => {
        // console.log(data.branchQuery.branches.items)
        return data.branchQuery
      }
    },
    $subscribe: {
      branchCreated: {
        query: gql`
          subscription($streamId: String!) {
            branchCreated(streamId: $streamId)
          }
        `,
        variables() {
          return {
            streamId: this.$route.params.streamId
          }
        },
        result(args) {
          if (!args.data.branchCreated) return
          this.snackbar = true
          this.snackbarInfo = { ...args.data.branchCreated, type: 'branch' }
        },
        skip() {
          return !this.loggedIn
        }
      },
      commitCreated: {
        query: gql`
          subscription($streamId: String!) {
            commitCreated(streamId: $streamId)
          }
        `,
        variables() {
          return {
            streamId: this.$route.params.streamId
          }
        },
        result(commitInfo) {
          if (!commitInfo.data.commitCreated) return
          console.log(commitInfo)
          this.snackbar = true
          this.snackbarInfo = { ...commitInfo.data.commitCreated, type: 'commit' }
        },
        skip() {
          return !this.loggedIn
        }
      }
    }
  },
  computed: {
    groupedBranches() {
      if (!this.branchQuery) return
      let branches = this.branchQuery.branches.items
      let items = []
      for (let b of branches) {
        if (b.name === 'globals') continue
        let parts = b.name.split('/')
        if (parts.length === 1) {
          items.push({ ...b, displayName: b.name, type: 'item', children: [] })
        } else {
          let existing = items.find((i) => i.name === parts[0] && i.type === 'group')
          if (!existing) {
            existing = { name: parts[0], type: 'group', children: [], expand: false }
            items.push(existing)
          }
          existing.children.push({
            ...b,
            displayName: parts.slice(1).join('/'),
            type: 'item'
          })
          if (this.$route.path.includes(b.name)) existing.expand = true
        }
      }
      let sorted = items.sort((a, b) => {
        const nameA = a.name.toLowerCase()
        const nameB = b.name.toLowerCase()
        if (nameA < nameB) return -1
        if (nameA > nameB) return 1
        return 0
      })

      return [
        ...sorted.filter((it) => it.name === 'main'),
        ...sorted.filter((it) => it.name !== 'main')
      ]
      // return items
    },
    streamUrl() {
      return `${window.location.origin}/streams/${this.$route.params.streamId}`
    },
    parsedDescription() {
      if (!this.stream || !this.stream.description) return 'No description provided.'
      return this.stream.description.replace(
        /\[(.+?)\]\((https?:\/\/[a-zA-Z0-9/.(]+?)\)/g,
        '<a href="$2" class="text-decoration-none" target="_blank">$1</a>'
      )
    },
    loggedIn() {
      return localStorage.getItem('uuid') !== null
    },
    sortedBranches() {
      // TODO: group by `/` (for later)
      if (!this.branchQuery) return
      return [
        this.branchQuery.branches.items.find((b) => b.name === 'main'),
        ...this.branchQuery.branches.items.filter((b) => b.name !== 'main' && b.name !== 'globals')
      ]
    },
    branchesTotalCount() {
      if (!this.branchQuery) return 0
      return this.branchQuery.branches.items.filter((b) => b.name !== 'globals').length
    },
    globalsTotalCount() {
      if (!this.stream.globals) return 0
      return this.stream.globals.totalCount
    },
    userId() {
      return localStorage.getItem('uuid')
    },
    loggedIn() {
      return localStorage.getItem('uuid') !== null
    }
  },
  watch: {
    $route(to) {
      // Ensures branch menu is open when navigating to a branch url
      if (to.name.toLowerCase().includes('branch') && !this.branchMenuOpen)
        this.branchMenuOpen = true
      // closes any share dialog
      this.shareStream = false
      this.snackbar = false
    }
    // branchMenuOpen(val) {
    //   if (this.$route.name.toLowerCase().includes('branch') && !val)
    //     this.$nextTick(() => {
    //       this.branchMenuOpen = true
    //     })
    // }
  },
  mounted() {
    setTimeout(
      function () {
        this.streamNav = !this.$vuetify.breakpoint.smAndDown
      }.bind(this),
      1
    )

    // Ensures branch menu is open when navigating directly to a branch url
    this.branchMenuOpen = this.$route.name.toLowerCase().includes('branch')
    // Open stream invite dialog if ?invite=true (used by desktop connectors)
    if (this.$route.query.invite && this.$route.query.invite === 'true') {
      setTimeout(() => {
        this.$refs.streamInviteDialog.show()
      }, 500)
    }
  },
  methods: {
    goToItemAndCloseSnackbar() {
      if (this.snackbarInfo.type === 'commit') {
        this.$router.push(`/streams/${this.$route.params.streamId}/commits/${this.snackbarInfo.id}`)
      } else if (this.snackbarInfo.type === 'branch') {
        this.$router.push(
          `/streams/${this.$route.params.streamId}/branches/${this.snackbarInfo.name}`
        )
        this.refetchBranches()
      }
      this.snackbar = false
    },
    copyToClipboard(e) {
      e.target.select()
      document.execCommand('copy')
    },
    openShareStreamDialog() {
      this.shareStream = true
      setTimeout(
        function () {
          // console.log(this.$refs.streamUrl.$refs.input)
          this.$refs.streamUrl.$refs.input.select()
          document.execCommand('copy')
        }.bind(this),
        100
      )
    },
    showStreamInviteDialog() {
      this.$refs.streamInviteDialog.show()
    },
    async changeVisibility() {
      this.swapPermsLoading = true
      try {
        await this.$apollo.mutate({
          mutation: gql`
            mutation editDescription($input: StreamUpdateInput!) {
              streamUpdate(stream: $input)
            }
          `,
          variables: {
            input: {
              id: this.$route.params.streamId,
              isPublic: this.stream.isPublic
            }
          }
        })
      } catch (e) {
        console.log(e)
        this.stream.isPublic = !this.stream.isPublic
      }
      this.swapPermsLoading = false
      this.$apollo.queries.stream.refetch()
    },
    refetchBranches() {
      this.$apollo.queries.branchQuery.refetch()
    },
    showNewBranchDialog() {
      this.$refs.branchDialog.show()
    },
    formatDate(d) {
      if (!this.stream) return null
      let date = new Date(d)
      let options = { year: 'numeric', month: 'short', day: 'numeric' }

      return date.toLocaleString(undefined, options)
    }
  }
}
</script>
<style scoped>
.no-overlay.v-list-item--active::before {
  opacity: 0 !important;
}
</style>
