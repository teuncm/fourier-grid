import { onBeforeUnmount, onMounted, ref } from 'vue'

export function useFullscreen() {
  const active = ref(false), supported = ref(false), error = ref('')
  const sync = () => { active.value = Boolean(document.fullscreenElement); error.value = '' }
  onMounted(() => {
    supported.value = Boolean(document.fullscreenEnabled && document.documentElement.requestFullscreen)
    sync()
    document.addEventListener('fullscreenchange', sync)
  })
  onBeforeUnmount(() => document.removeEventListener('fullscreenchange', sync))
  async function toggle() {
    error.value = ''
    try {
      if (document.fullscreenElement) await document.exitFullscreen()
      else await document.documentElement.requestFullscreen()
    } catch {
      error.value = 'Fullscreen could not be opened. Check your browser permissions.'
    }
  }
  return { active, supported, error, toggle }
}
