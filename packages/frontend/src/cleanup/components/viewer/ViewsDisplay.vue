<template>
  <v-list dense nav class="mt-0 py-0 mb-3">
    <v-list-item
      :class="`px-2 list-overlay-${$vuetify.theme.dark ? 'dark' : 'light'} elevation-2`"
      active
      style="position: sticky; top: 82px"
      @click="expand = !expand"
    >
      <v-list-item-action>
        <v-icon small>mdi-camera</v-icon>
      </v-list-item-action>
      <v-list-item-content>
        <v-list-item-title>
          Views
          <span class="caption grey--text">({{ views.length }})</span>
        </v-list-item-title>
      </v-list-item-content>
      <v-list-item-action class="pa-0 ma-0">
        <v-btn small icon @click.stop="expand = !expand">
          <v-icon>{{ expand ? 'mdi-chevron-up' : 'mdi-chevron-down' }}</v-icon>
        </v-btn>
      </v-list-item-action>
    </v-list-item>
    <v-expand-transition>
      <div v-show="expand" class="">
        <v-list-item v-for="view in views" :key="view.id" @click="setView(view)">
          <v-list-item-content>
            <v-list-item-title>{{ view.name }}</v-list-item-title>
          </v-list-item-content>
        </v-list-item>
      </div>
    </v-expand-transition>
  </v-list>
</template>
<script>
export default {
  props: {
    views: {
      type: Array,
      default: () => []
    }
  },
  data() {
    return {
      expand: false
    }
  },
  methods: {
    setView(view) {
      window.__viewer.interactions.setView(view.id)
    }
  }
}
</script>
<style scoped>
.list-overlay-dark {
  background: rgba(40, 40, 40, 1);
  z-index: 5;
}
.list-overlay-light {
  background: rgba(235, 235, 235, 1);
  z-index: 5;
}
</style>
