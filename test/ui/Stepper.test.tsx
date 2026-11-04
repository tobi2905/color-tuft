import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { Stepper } from '../../src/ui/Stepper'

/** Renders the stepper to HTML (no browser needed) and reads its buttons. */
function buttons(html: string) {
  return [...html.matchAll(/<button([^>]*)>(.*?)<\/button>/g)].map(([, attrs, inner]) => ({
    label: inner.replace(/<[^>]+>/g, '').trim(),
    disabled: attrs.includes('disabled'),
    current: attrs.includes('aria-current="step"'),
  }))
}

describe('Stepper', () => {
  it('shows all six steps, numbered', () => {
    const html = renderToStaticMarkup(
      <Stepper current="setup" available={['setup']} onSelect={() => {}} />,
    )
    expect(buttons(html).map((b) => b.label)).toEqual([
      '1 Setup',
      '2 Colours',
      '3 Outline',
      '4 Preview',
      '5 Yarn',
      '6 Projector',
    ])
  })

  it('disables the steps that are not available and marks the current one', () => {
    const html = renderToStaticMarkup(
      <Stepper current="colours" available={['setup', 'colours']} onSelect={() => {}} />,
    )
    const b = buttons(html)
    expect(b.map((x) => x.disabled)).toEqual([false, false, true, true, true, true])
    expect(b.filter((x) => x.current).map((x) => x.label)).toEqual(['2 Colours'])
  })
})
