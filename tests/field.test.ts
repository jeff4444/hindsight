import { describe, expect, it } from 'vitest';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Field, INPUT_CLASS } from '@/components/ui';

/**
 * `Field` has two shapes, and the second one exists because the first one threw.
 *
 * The component renders its own `<input>` from props. The tape builder used it as a wrapper instead
 * — `<Field label="Name"><input …/></Field>` — and `children` fell into the `...rest` that gets
 * spread onto that input. An input is a void element, so React does not warn and recover here; it
 * throws "input is a self-closing tag and must neither have `children` nor use
 * dangerouslySetInnerHTML", which took `/tapes/new` to the error boundary on every render.
 *
 * TypeScript could not catch it: `children` is a legal `InputHTMLAttributes` key, so the misuse
 * type-checked cleanly all the way to production. That is the whole reason this is pinned in a test
 * rather than left to the compiler.
 *
 * Rendered with `renderToStaticMarkup` because the failure is a render-time invariant, not a
 * behaviour — if the markup comes back at all, the bug is gone.
 */

describe('Field', () => {
  it('renders its own input when given input props', () => {
    const html = renderToStaticMarkup(
      h(Field, { id: 'email', label: 'Email', type: 'email', placeholder: 'you@example.com' }),
    );
    expect(html).toContain('<input');
    expect(html).toContain('for="email"');
    expect(html).toContain('placeholder="you@example.com"');
  });

  it('wraps a control passed as children instead of spreading it onto a void input', () => {
    const html = renderToStaticMarkup(
      h(
        Field,
        { label: 'Description' },
        h('textarea', { className: INPUT_CLASS, defaultValue: '' }),
      ),
    );
    expect(html).toContain('<textarea');
    expect(html).toContain('Description');
    // The caller's control is the only one on the page: rendering ours as well would give the field
    // two inputs and post the wrong one.
    expect(html).not.toContain('<input');
  });

  it('associates the label with a child control that has no id', () => {
    const html = renderToStaticMarkup(
      h(Field, { label: 'Name' }, h('input', { className: INPUT_CLASS })),
    );
    // No id to point a `for` at, so the label has to wrap the control to associate it at all.
    expect(html).not.toContain('for=');
    expect(html.indexOf('<label')).toBeLessThan(html.indexOf('<input'));
    expect(html).toContain('</label>');
  });

  it('shows the hint and the error in both shapes', () => {
    const withInput = renderToStaticMarkup(
      h(Field, { id: 'pw', label: 'Password', error: 'Too short.' }),
    );
    expect(withInput).toContain('Too short.');
    expect(withInput).toContain('aria-describedby="pw-error"');

    const withChildren = renderToStaticMarkup(
      h(Field, { label: 'Description', hint: 'Optional.' }, h('textarea', {})),
    );
    expect(withChildren).toContain('Optional.');
    // No id was supplied, so there is nothing to hang `id="undefined-hint"` on.
    expect(withChildren).not.toContain('undefined');
  });
});
