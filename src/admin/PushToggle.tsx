import { useEffect, useState } from 'react'
import { useT } from './i18n'
import { disablePush, enablePush, readPushState, refreshPush, type PushState } from './push'
import { Switch, useToast } from './ui'

/** "Notifications on this device" switch for the Orders page. */
export default function PushToggle() {
  const { t, lang, errorText } = useT()
  const toast = useToast()
  const [state, setState] = useState<PushState | null>(null)
  const [working, setWorking] = useState(false)

  useEffect(() => {
    let active = true
    readPushState()
      .then((next) => active && setState(next))
      .catch(() => active && setState('unsupported'))
    return () => {
      active = false
    }
  }, [])

  // Notifications are written in the language this device last used the panel in.
  useEffect(() => {
    if (state === 'on') refreshPush(lang).catch((e) => console.warn('Could not refresh the push subscription', e))
  }, [state, lang])

  if (state === null) return null

  if (state === 'unsupported' || state === 'needs-install') {
    return <p className="ad-push-note ad-muted ad-small">{state === 'unsupported' ? t.pushUnsupported : t.pushNeedsInstall}</p>
  }

  const toggle = async (on: boolean) => {
    setWorking(true)
    try {
      if (on) {
        const next = await enablePush(lang)
        setState(next)
        if (next === 'on') toast.success(t.pushEnabled)
        else if (next === 'denied') toast.error(t.pushBlocked)
      } else {
        await disablePush()
        setState('off')
        toast.success(t.pushDisabled)
      }
    } catch (e) {
      toast.error(t.pushFailed(errorText(e)))
      setState(await readPushState().catch(() => 'off' as const))
    } finally {
      setWorking(false)
    }
  }

  return (
    <div className="ad-switch-row ad-push-row">
      <Switch checked={state === 'on'} onChange={(on) => void toggle(on)} label={t.pushLabel} disabled={working || state === 'denied'} />
      <span className="ad-muted ad-small">
        {state === 'denied' ? t.pushBlocked : state === 'on' ? t.pushOnHint : t.pushOffHint}
      </span>
    </div>
  )
}
