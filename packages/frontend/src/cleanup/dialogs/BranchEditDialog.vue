<template>
  <v-card v-if="editableBranch && editableBranch.name !== 'main'" :loading="loading">
    <v-toolbar color="primary" dark flat>
      <v-app-bar-nav-icon style="pointer-events: none">
        <v-icon>mdi-pencil</v-icon>
      </v-app-bar-nav-icon>
      <v-toolbar-title>Edit Branch</v-toolbar-title>
      <v-spacer></v-spacer>
      <v-btn icon @click="$emit('close')"><v-icon>mdi-close</v-icon></v-btn>
    </v-toolbar>
    <v-alert v-show="error" dismissible type="error">
      {{ error }}
    </v-alert>
    <v-form ref="form" v-model="valid" lazy-validation>
      <v-card-text>
        <v-text-field
          v-model="editableBranch.name"
          label="Name"
          :rules="nameRules"
          required
        ></v-text-field>
        <p class="caption">
          Tip: you can create nested branches by using "/" as a separator in their names. E.g.,
          "mep/stage-1" or "arch/sketch-design".
        </p>
        <v-textarea v-model="editableBranch.description" rows="2" label="Description"></v-textarea>
      </v-card-text>
    </v-form>
    <v-card-actions>
      <v-btn text color="error" @click="showDeleteDialog = true">
        <v-icon small>mdi-delete</v-icon>
        <span class="ml-2">Delete</span>
      </v-btn>
      <v-spacer></v-spacer>
      <v-btn text @click="$emit('close')">Cancel</v-btn>
      <v-btn color="primary" :disabled="!valid" @click="updateBranch()">Save</v-btn>
    </v-card-actions>
    <v-dialog v-model="showDeleteDialog" max-width="500">
      <v-card>
        <v-toolbar color="error" dark flat>
          <v-app-bar-nav-icon style="pointer-events: none">
            <v-icon>mdi-pencil</v-icon>
          </v-app-bar-nav-icon>
          <v-toolbar-title>Delete Branch</v-toolbar-title>
          <v-spacer></v-spacer>
          <v-btn icon @click="showDeleteDialog = false"><v-icon>mdi-close</v-icon></v-btn>
        </v-toolbar>
        <v-card-text class="mt-4">
          You cannot undo this action. The branch
          <code>{{ editableBranch.name }}</code>
          will be permanently deleted. To confirm, type its name below:
          <v-text-field
            v-model="branchNameConfirmation"
            label="Confirm branch name"
            required
          ></v-text-field>
        </v-card-text>
        <v-card-actions>
          <v-spacer></v-spacer>
          <v-btn text @click="showDeleteDialog = false">Cancel</v-btn>
          <v-btn
            color="error"
            text
            :disabled="branchNameConfirmation !== editableBranch.name"
            @click="deleteBranch()"
          >
            Delete
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </v-card>
  <v-card v-else>
    <v-card-text>You cannot edit the main branch.</v-card-text>
  </v-card>
</template>
<script>
import gql from 'graphql-tag'

export default {
  props: ['stream'],
  data() {
    return {
      dialog: false,
      editableBranch: this.stream.branch,
      branchNameConfirmation: null,
      valid: true,
      loading: false,
      showDeleteDialog: false,
      nameRules: [
        (v) => !!v || 'Name is required.',
        (v) =>
          !(v.startsWith('#') || v.endsWith('#') || v.startsWith('/') || v.endsWith('/')) ||
          'Branch names cannot start or end with "#" or "/"',
        (v) =>
          (v && this.allBranchNames.findIndex((e) => e === v) === -1) ||
          'A branch with this name already exists',
        (v) => (v && v.length <= 100) || 'Name must be less than 100 characters',
        (v) => (v && v.length >= 3) || 'Name must be at least 3 characters'
      ],
      isEdit: false,
      pendingDelete: false,
      allBranchNames: [],
      error: null
    }
  },
  apollo: {
    allBranchNames: {
      query: gql`
        query branchNames($id: String!) {
          stream(id: $id) {
            id
            branches {
              items {
                name
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
      update(data) {
        return data.stream.branches.items.filter((b) => b.name !== this.branch.name)
      },
      skip() {
        return this.branch == null
      }
    }
  },
  methods: {
    async deleteBranch() {
      this.loading = true
      this.error = null
      this.$matomo && this.$matomo.trackPageView('branch/delete')
      try {
        await this.$apollo.mutate({
          mutation: gql`
            mutation branchDelete($params: BranchDeleteInput!) {
              branchDelete(branch: $params)
            }
          `,
          variables: {
            params: {
              streamId: this.$route.params.streamId,
              id: this.branch.id
            }
          }
        })
      } catch (err) {
        this.$eventHub.$emit('notification', { text: err.message })
      }

      this.loading = false
      this.showDelete = false
      this.$eventHub.$emit('notification', { text: 'Branch deleted' })
      this.$router.push(`/streams/` + this.$route.params.streamId)
    },
    async updateBranch() {
      if (!this.$refs.form.validate()) return

      this.loading = true
      this.$matomo && this.$matomo.trackPageView('branch/update')
      try {
        await this.$apollo.mutate({
          mutation: gql`
            mutation branchUpdate($params: BranchUpdateInput!) {
              branchUpdate(branch: $params)
            }
          `,
          variables: {
            params: {
              streamId: this.$route.params.streamId,
              id: this.editableBranch.id,
              name: this.editableBranch.name,
              description: this.editableBranch.description
            }
          }
        })
      } catch (err) {
        this.$eventHub.$emit('notification', { text: err.message })
      }

      this.loading = false
      this.$eventHub.$emit('branch-refresh')
      this.$eventHub.$emit('notification', {
        text: 'Branch updated',
        action: {
          name: 'View',
          to: `/streams/` + this.$route.params.streamId + `/branches/` + this.editableBranch.name
        }
      })
      this.$router.push(
        `/streams/` + this.$route.params.streamId + `/branches/` + this.editableBranch.name
      )
      this.$emit('close')
    }
  }
}
</script>
