<template>
  <v-container class="pa-0">
    <portal to="toolbar">
      <div class="d-flex align-center">
        <div class="text-truncate">
          <router-link
            v-tooltip="stream.name"
            class="text-decoration-none space-grotesk mx-1"
            :to="`/streams/${stream.id}`"
          >
            <v-icon small class="primary--text mb-1 mr-1">mdi-folder</v-icon>
            <b>{{ stream.name }}</b>
          </router-link>
        </div>
        <div class="text-truncate flex-shrink-0">
          /
          <v-icon small class="mr-2 mb-1 hidden-xs-only">mdi-cog</v-icon>
          <span class="space-grotesk">Settings</span>
        </div>
      </div>
    </portal>
    <v-row>
      <v-col v-if="stream.role !== 'stream:owner'" cols="12">
        <v-alert type="warning">
          Your permission level ({{ stream.role }}) is not high enough to edit this stream's
          details.
        </v-alert>
      </v-col>
      <v-col cols="12">
        <section-card>
          <template #header>
            <v-icon class="mr-2" small>mdi-cog</v-icon>
            <span class="d-inline-block">General</span>
          </template>
          <v-card-text>
            <v-form ref="form" v-model="valid" class="px-2" @submit.prevent="save">
              <v-text-field
                v-model="name"
                :rules="validation.nameRules"
                label="Name"
                hint="The name of this stream."
                class="mt-5"
                :disabled="stream.role !== 'stream:owner'"
              />
              <v-text-field
                v-model="description"
                label="Description"
                hint="The description of this stream."
                class="mt-5"
                :disabled="stream.role !== 'stream:owner'"
              />

              <v-switch
                v-model="isPublic"
                inset
                class="mt-5"
                :label="isPublic ? 'Public (Link Sharing)' : 'Private'"
                :hint="
                  isPublic
                    ? 'Anyone with the link can view this stream. It is also visible on your profile page. Only collaborators can push data to it.'
                    : 'Only collaborators can access this stream.'
                "
                persistent-hint
                :disabled="stream.role !== 'stream:owner'"
              />
            </v-form>
          </v-card-text>
          <v-card-actions>
            <v-btn class="ml-3" color="primary" type="submit" :disabled="!canSave" @click="save">
              Save Changes
            </v-btn>
          </v-card-actions>
        </section-card>
      </v-col>
      <v-col cols="12">
        <section-card expandable :expand="false">
          <template #header>Danger Zone</template>

          <v-card-text class="d-flex align-center">
            <div>
              <v-btn
                color="error"
                fab
                dark
                small
                :disabled="stream.role !== 'stream:owner'"
                @click="deleteDialog = true"
              >
                <v-icon>mdi-delete-forever</v-icon>
              </v-btn>
            </div>
            <div class="ml-4">
              <div class="text-subtitle-1">Permanently Delete Stream</div>
              <div class="caption">
                Once you delete a stream, there is no going back! All data will be removed, and
                existing collaborators will not be able to access it.
              </div>
            </div>
          </v-card-text>
        </section-card>
        <v-dialog v-model="deleteDialog" width="500" @keydown.esc="deleteDialog = false">
          <v-card>
            <v-toolbar class="error mb-4">
              <v-toolbar-title>Deleting Stream '{{ stream.name }}'</v-toolbar-title>
              <v-spacer></v-spacer>
              <v-toolbar-items>
                <v-btn icon @click="deleteDialog = false">
                  <v-icon>mdi-close</v-icon>
                </v-btn>
              </v-toolbar-items>
            </v-toolbar>

            <v-card-text>
              Type the name of the stream below to confirm you really want to delete it. All data
              will be removed, and existing collaborators will not be able to access it.
              <v-divider class="my-2"></v-divider>
              <b>You cannot undo this action.</b>

              <v-text-field
                v-model="streamNameConfirm"
                label="Confirm stream name"
                class="pt-10"
              ></v-text-field>
            </v-card-text>
            <v-card-actions>
              <!-- <v-btn text color="primary" @click="deleteDialog = false">Cancel</v-btn> -->
              <v-btn
                block
                class="mr-3"
                color="error"
                :disabled="streamNameConfirm !== stream.name"
                @click="deleteStream"
              >
                delete
              </v-btn>
            </v-card-actions>
          </v-card>
        </v-dialog>
      </v-col>
    </v-row>
  </v-container>
</template>

<script>
import gql from 'graphql-tag'

export default {
  name: 'StreamSettings',
  components: {
    SectionCard: () => import('@/cleanup/components/common/SectionCard')
  },
  apollo: {
    stream: {
      query: gql`
        query Stream($id: String!) {
          stream(id: $id) {
            id
            name
            description
            isPublic
            role
          }
        }
      `,
      variables() {
        return {
          id: this.$route.params.streamId
        }
      },

      update(data) {
        let stream = data.stream
        if (stream)
          ({ name: this.name, description: this.description, isPublic: this.isPublic } = stream)

        return stream
      }
    }
  },
  data: () => ({
    snackbar: false,
    loading: false,
    loadingDelete: false,
    valid: false,
    name: null,
    deleteDialog: false,
    streamNameConfirm: '',
    description: null,
    isPublic: true,
    validation: {
      nameRules: [(v) => !!v || 'A stream must have a name!']
    }
  }),
  computed: {
    canSave() {
      return (
        this.stream.role === 'stream:owner' &&
        this.valid &&
        (this.name !== this.stream.name ||
          this.description !== this.stream.description ||
          this.isPublic !== this.stream.isPublic)
      )
    }
  },

  methods: {
    async save() {
      this.loading = true
      this.$matomo && this.$matomo.trackPageView('stream/update')
      try {
        await this.$apollo.mutate({
          mutation: gql`
            mutation editDescription($input: StreamUpdateInput!) {
              streamUpdate(stream: $input)
            }
          `,
          variables: {
            input: {
              id: this.stream.id,
              name: this.name,
              description: this.description,
              isPublic: this.isPublic
            }
          }
        })
        this.$eventHub.$emit('notification', {
          text: 'Stream updated.'
        })
      } catch (e) {
        this.$eventHub.$emit('notification', {
          text: e.message
        })
      }

      this.$apollo.queries.stream.refetch()
      this.loading = false
    },
    async deleteStream() {
      this.$matomo && this.$matomo.trackPageView('stream/delete')
      this.loadingDelete = true
      try {
        await this.$apollo.mutate({
          mutation: gql`
            mutation deleteStream($id: String!) {
              streamDelete(id: $id)
            }
          `,
          variables: {
            id: this.stream.id
          }
        })
        this.$eventHub.$emit('notification', {
          text: 'Stream deleted.'
        })
      } catch (e) {
        this.$eventHub.$emit('notification', {
          text: e.message
        })
      }
      this.deleteDialog = false
      this.$router.push({ path: '/streams' })
    }
  }
}
</script>
