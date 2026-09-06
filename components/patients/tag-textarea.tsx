'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  parseMarkers,
  findTaggedTerms,
  findDictionaryMatches,
  wrapTerm,
  keyOf,
} from '@/lib/medical-tags';
import { cn } from '@/lib/utils';

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Zero-width caret anchor after each pill so the caret can be placed past a
// tag. Stripped when reading the value.
const ZWSP = '​';

// The pill is a plain *inline* span (NOT inline-flex/inline-block) so the caret
// flows through it like normal text and it never expands the line box. It
// inherits the surrounding font-size, so it is never taller than the text.
const PILL_CLASS =
  'rounded bg-primary/10 px-1 font-medium text-primary whitespace-normal';

// Markers are kept in the DOM as hidden spans (invisible, but present for
// textContent so tags round-trip). Only the word shows as a pill — no visible
// underscores. A zero-width space after each pill gives the caret a place to
// land so the user can keep typing past a tag.
function tagHtml(value: string): string {
  const multi = /\s/.test(value);
  const open = multi ? '_"' : '_';
  const close = multi ? '"_' : '_';
  return `<span class="hidden">${escapeHtml(open)}</span><span class="${PILL_CLASS}" data-tag-pill>${escapeHtml(value)}</span><span class="hidden">${escapeHtml(close)}</span>${ZWSP}`;
}

/** Render the editor's innerHTML: marker-wrapped segments become pills. */
function renderHtml(text: string): string {
  return parseMarkers(text)
    .map((s) => (s.type === 'tag' ? tagHtml(s.value) : escapeHtml(s.value)))
    .join('');
}

function escapeRegexChar(c: string): string {
  return c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Wrap every occurrence of `term` (case/accent tolerant) in markers. */
function wrapOccurrences(text: string, term: string): string {
  const pattern = keyOf(term)
    .split(' ')
    .map(escapeRegexChar)
    .join('\\s+');
  return text.replace(new RegExp(pattern, 'gi'), () => wrapTerm(term));
}

export function TagTextarea({
  name,
  defaultValue,
  dictionary,
  placeholder,
  rows = 2,
  className,
}: {
  name: string;
  defaultValue?: string | null;
  dictionary: string[];
  placeholder?: string;
  rows?: number;
  className?: string;
}) {
  const t = useTranslations('patients');
  const editorRef = useRef<HTMLDivElement>(null);
  const [editing, setEditing] = useState(false);
  const [plainText, setPlainText] = useState(defaultValue ?? '');
  const [error, setError] = useState<string | null>(null);

  const dictSet = useMemo(() => new Set(dictionary.map((d) => keyOf(d))), [dictionary]);

  // Re-render pills on blur/display (not mid-keystroke, to protect the caret).
  useEffect(() => {
    if (editorRef.current && !editing) {
      editorRef.current.innerHTML = renderHtml(plainText);
    }
  }, [plainText, editing]);

  function applyRender(text: string) {
    if (editorRef.current) editorRef.current.innerHTML = renderHtml(text);
  }

  // Bottom tag list: dictionary terms found in the text PLUS any terms the
  // user marked by hand (_tag_), so a freshly typed tag is visible here too.
  const matches = useMemo(() => {
    const dict = findDictionaryMatches(plainText, dictionary);
    const seen = new Set(dict.map(keyOf));
    const extra = findTaggedTerms(plainText).filter((x) => !seen.has(keyOf(x)));
    return [...dict, ...extra];
  }, [plainText, dictionary]);
  const taggedKeys = useMemo(
    () => new Set(findTaggedTerms(plainText).map(keyOf)),
    [plainText],
  );

  function handleInput() {
    const el = editorRef.current;
    if (!el) return;
    // textContent (not innerText) so the hidden marker spans round-trip;
    // strip only the zero-width caret anchors.
    const text = (el.textContent ?? '').replaceAll(ZWSP, '');
    setPlainText(text);
    setError(null);
    liveConvert(el, text);
  }

  /**
   * If the user just finished typing a complete marker (_tag_), convert it to
   * a pill immediately and put the caret right after it. Ordinary typing (no
   * new complete marker) leaves the DOM alone so the caret is never disturbed.
   */
  function liveConvert(el: HTMLElement, text: string) {
    for (const term of findTaggedTerms(text)) {
      const hasPill = Array.from(el.querySelectorAll('span[data-tag-pill]')).some(
        (s) => s.textContent === term,
      );
      if (!hasPill) {
        el.innerHTML = renderHtml(text);
        placeCaretAfterTag(el, term);
        return;
      }
    }
  }

  /** Put the caret just after the given tag's pill (past its closing marker). */
  function placeCaretAfterTag(el: HTMLElement, term: string) {
    const pills = el.querySelectorAll('span[data-tag-pill]');
    for (const pill of pills) {
      if (pill.textContent !== term) continue;
      // Skip the hidden closing marker; land on the zero-width anchor after it.
      let node: Node | null = pill.nextSibling;
      while (
        node &&
        node.nodeType === Node.ELEMENT_NODE &&
        (node as HTMLElement).classList.contains('hidden')
      ) {
        node = node.nextSibling;
      }
      const sel = window.getSelection();
      if (!sel) return;
      const range = document.createRange();
      if (node && node.nodeType === Node.TEXT_NODE && (node.textContent ?? '').startsWith(ZWSP)) {
        range.setStart(node, 1);
      } else {
        range.setStartAfter(pill);
      }
      range.collapse(true);
      sel.removeAllRanges();
      sel.addRange(range);
      return;
    }
  }

  /** Toggle a dictionary term as tagged across all its occurrences. */
  function toggle(term: string) {
    const key = keyOf(term);
    if (taggedKeys.has(key)) {
      // Un-tag: remove this term's markers only (leave other tags untouched).
      const parts = key
        .split(' ')
        .map(escapeRegexChar)
        .join('\\s+');
      const patterns = [new RegExp(`_"(?:${parts})"_`, 'gi'), new RegExp(`_(?:${parts})_`, 'gi')];
      let next = plainText;
      for (const re of patterns) {
        next = next.replace(re, (s) => (s.includes('_"_') ? s.slice(2, -2) : s.slice(1, -1)));
      }
      setPlainText(next);
      applyRender(next);
    } else {
      const next = wrapOccurrences(plainText, term);
      setPlainText(next);
      applyRender(next);
    }
  }

  return (
    <div className={cn('space-y-1.5', className)}>
      <div
        ref={editorRef}
        contentEditable
        role="textbox"
        aria-multiline="true"
        aria-label={name}
        data-field={name}
        onInput={handleInput}
        onFocus={() => setEditing(true)}
        onBlur={() => setEditing(false)}
        className="block min-h-[80px] w-full cursor-text rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        suppressContentEditableWarning
        data-placeholder={placeholder}
      />
      {matches.length > 0 ? (
        <div className="space-y-1.5">
          <p className="text-xs text-muted-foreground">{t('knownTags')}</p>
          <div className="flex flex-wrap gap-1.5">
            {matches.map((term) => {
              const on = taggedKeys.has(keyOf(term));
              return (
                <button
                  key={term}
                  type="button"
                  onClick={() => toggle(term)}
                  aria-pressed={on}
                  className={cn(
                    'inline-flex min-h-[44px] items-center gap-1 rounded-full border px-3 text-sm font-medium touch-manipulation',
                    on
                      ? 'border-transparent bg-primary/10 text-primary'
                      : 'border-input bg-background text-muted-foreground',
                  )}
                >
                  {term}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      <input type="hidden" name={name} value={plainText} />
    </div>
  );
}