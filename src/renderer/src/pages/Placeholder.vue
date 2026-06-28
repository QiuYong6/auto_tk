<script setup>
defineProps({
  icon: { type: String, default: '🧩' },
  name: { type: String, default: '' },
  desc: { type: String, default: '' }
})
</script>

<template>
  <div class="panel placeholder">
    <div class="big">{{ icon }}</div>
    <b>{{ name }}</b>
    <p class="muted" style="margin-top:8px">{{ desc }}</p>
  </div>
</template>
