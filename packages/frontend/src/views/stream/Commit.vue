<template>
  <div>
    <v-row v-if="$apollo.queries.stream.loading" no-gutters>
      <v-col cols="12" class="ma-0 pa-0">
        <v-card>
          <v-skeleton-loader type="list-item-avatar, card-avatar, article"></v-skeleton-loader>
        </v-card>
      </v-col>
    </v-row>
    <v-row v-if="stream">
      <portal to="streamTitleBar">
        <commit-toolbar :stream="stream" @edit-commit="showCommitEditDialog = true" />
      </portal>
    </v-row>
    <div style="height: 100vh; width: 100%; top: -64px; position: absolute">
      <renderer :object-url="commitObjectUrl" @selection="handleSelection" />
    </div>

    <div v-if="stream" cols="12" class="ma-0 pa-0" style="position: relative; top: -64px">
      <portal to="nav">
        <v-list v-if="stream" style="padding-left: 10px" nav dense class="mt-0 pt-0" expand>
          <v-list-item
            link
            :to="`/streams/${stream.id}/branches/${stream.commit.branchName}`"
            class=""
          >
            <v-list-item-icon>
              <v-icon small class>mdi-arrow-left-drop-circle</v-icon>
            </v-list-item-icon>
            <v-list-item-content>
              <v-list-item-title class="font-weight-bold">
                <v-icon small class="mr-1 caption">mdi-source-branch</v-icon>
                {{ stream.commit.branchName }}
              </v-list-item-title>
            </v-list-item-content>
          </v-list-item>
          <v-list-item>
            <v-list-item-icon>
              <v-icon small class>mdi-new</v-icon>
            </v-list-item-icon>
            <v-list-item-content>
              <v-list-item-title class="font-weight-bold">
                TODO: Insert commit menu; mostly viewer based
              </v-list-item-title>
            </v-list-item-content>
          </v-list-item>
        </v-list>
        <v-card v-if="false" rounded="lg" style="width: 100%" class="transparent elevation-0">
          <!-- Selected object -->
          <v-expand-transition>
            <v-sheet v-show="selectionData.length !== 0" class="pa-4" color="transparent">
              <v-card-title class="mr-8">
                <v-badge inline :content="selectionData.length">
                  <v-icon class="mr-2">mdi-cube</v-icon>
                  Selection
                </v-badge>
              </v-card-title>
              <div v-if="selectionData.length !== 0">
                <object-simple-viewer
                  v-for="(obj, ind) in selectionData"
                  :key="obj.id + ind"
                  :value="obj"
                  :stream-id="stream.id"
                  :key-name="`Selected Object ${ind + 1}`"
                  force-show-open-in-new
                  force-expand
                />
              </div>
            </v-sheet>
          </v-expand-transition>
          <!-- Object explorer -->
          <v-card class="pa-4" rounded="lg" color="transparent">
            <v-toolbar flat class="transparent">
              <v-app-bar-nav-icon style="pointer-events: none">
                <v-icon>mdi-database</v-icon>
              </v-app-bar-nav-icon>
              <v-toolbar-title>Data</v-toolbar-title>
              <v-spacer />
              <commit-received-receipts
                :stream-id="$route.params.streamId"
                :commit-id="stream.commit.id"
              />
            </v-toolbar>
            <v-card-text class="pa-0">
              <object-speckle-viewer
                class="mt-4"
                :stream-id="stream.id"
                :object-id="stream.commit.referencedObject"
                :value="commitObject"
                :expand="true"
              ></object-speckle-viewer>
            </v-card-text>
          </v-card>
        </v-card>
      </portal>
    </div>

    <v-row v-if="!$apollo.queries.stream.loading && !stream.commit" justify="center">
      <error-placeholder error-type="404">
        <h2>Commit {{ $route.params.commitId }} not found.</h2>
      </error-placeholder>
    </v-row>
    <commit-edit-dialog
      ref="commitDialog"
      @show-delete="showDeleteDialog = true"
    ></commit-edit-dialog>

    <v-dialog v-model="showDeleteDialog" width="500">
      <v-card class="pa-0 transparent">
        <v-alert type="info" class="ma-0">
          <h3>Are you sure?</h3>
          You cannot undo this action. This will permanently delete the commit
          <v-chip
            :to="`/streams/${$route.params.streamId}/commits/${
              stream && stream.commit ? stream.commit.id : null
            }`"
            color="primary"
            @click="showDeleteDialog = false"
          >
            <v-icon small class="mr-2 float-left" light>mdi-timeline-remove-outline</v-icon>
            {{ stream && stream.commit ? stream.commit.id : null }}
          </v-chip>
          <v-divider class="my-3"></v-divider>
          <v-btn text class="error--text" @click="deleteCommit">Delete</v-btn>
          <v-btn text @click="showDeleteDialog = false">Cancel</v-btn>
        </v-alert>
      </v-card>
    </v-dialog>
  </div>
</template>
<script>
import gql from 'graphql-tag'
import streamCommitQuery from '@/graphql/commit.gql'

export default {
  name: 'Branch',
  components: {
    CommitEditDialog: () => import('@/components/dialogs/CommitEditDialog'),
    ObjectSpeckleViewer: () => import('@/components/ObjectSpeckleViewer'),
    ObjectSimpleViewer: () => import('@/components/ObjectSimpleViewer'),
    Renderer: () => import('@/components/Renderer'),
    ErrorPlaceholder: () => import('@/components/ErrorPlaceholder'),
    CommitReceivedReceipts: () => import('@/components/CommitReceivedReceipts'),
    CommitToolbar: () => import('@/cleanup/toolbars/CommitToolbar')
  },
  data: () => ({
    loadedModel: false,
    selectionData: [],
    showCommitEditDialg: false,
    showDeleteDialog: false
  }),
  apollo: {
    stream: {
      prefetch: true,
      query: streamCommitQuery,
      variables() {
        return {
          streamId: this.$route.params.streamId,
          id: this.$route.params.commitId
        }
      }
    }
  },
  computed: {
    loggedInUserId() {
      return localStorage.getItem('uuid')
    },
    commitDate() {
      if (!this.stream.commit) return null
      let date = new Date(this.stream.commit.createdAt)
      let options = { year: 'numeric', month: 'long', day: 'numeric' }

      return date.toLocaleString(undefined, options)
    },
    commitObject() {
      return {
        speckle_type: 'reference',
        referencedId: this.stream?.commit.referencedObject
      }
    },
    commitObjectUrl() {
      return `${window.location.origin}/streams/${this.stream?.id}/objects/${this.commitObject.referencedId}`
    }
  },
  watch: {
    stream(val) {
      if (!val) return
      if (val && val.commit && val.commit.branchName && val.commit.branchName === 'globals')
        this.$router.push(`/streams/${this.$route.params.streamId}/globals/${val.commit.id}`)
    }
  },
  methods: {
    handleSelection(selectionData) {
      this.selectionData.splice(0, this.selectionData.length)
      this.selectionData.push(...selectionData)
    },
    editCommit() {
      this.$refs.commitDialog.open(this.stream.commit, this.stream.id).then((dialog) => {
        if (!dialog.result) return

        this.$matomo && this.$matomo.trackPageView('commit/update')
        this.$apollo
          .mutate({
            mutation: gql`
              mutation commitUpdate($myCommit: CommitUpdateInput!) {
                commitUpdate(commit: $myCommit)
              }
            `,
            variables: {
              myCommit: { ...dialog.commit }
            }
          })
          .then(() => {
            this.$apollo.queries.stream.refetch()
          })
          .catch((error) => {
            // Error
            console.error(error)
          })
      })
    },
    deleteCommit() {
      this.$matomo && this.$matomo.trackPageView('commit/delete')
      let commitBranch = null
      if (
        this.stream &&
        this.stream.commit &&
        this.stream.commit.branchName &&
        this.stream.commit.branchName
      )
        commitBranch = this.stream.commit.branchName

      this.$apollo
        .mutate({
          mutation: gql`
            mutation commitUpdate($myCommit: CommitDeleteInput!) {
              commitDelete(commit: $myCommit)
            }
          `,
          variables: {
            myCommit: {
              streamId: this.stream.id,
              id: this.stream.commit.id
            }
          }
        })
        .then(() => {
          this.$apollo.queries.stream.refetch()
        })
        .catch((error) => {
          // Error
          console.error(error)
        })
      this.showDeleteDialog = false
      //window.location.href = window.origin + `/streams/` + this.$route.params.streamId + `/branches/` + commitBranch //go to branch page, refresh all
      this.$router.push(`/streams/` + this.$route.params.streamId + `/branches/` + commitBranch)
    }
  }
}
</script>
<style scoped></style>
