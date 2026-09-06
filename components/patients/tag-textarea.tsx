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

// The pill is a plain *inline* span (NOT inline-flex/inline-block) so the caret
// flows through it like normal text and it never expands the line box. It
// inherits the surrounding font-size, so it is never taller than the text.
const PILL_CLASS =
  'rounded bg-primary/10 px-1 font-medium text-primary whitespace-normal';

// The literal marker delimiters (_word_, _"word word"_) stay as real characters
// in the DOM, so reading via textContent round-trips the tag encoding and the
// closing marker gives the caret a place to land past the pill.
function tagHtml(value: string): string {
  const multi = /\s/.test(value);
  const open = multi ? '_"' : '_';
  const close = multi ? '"_' : '_';
  return `${escapeHtml(open)}<span class="${PILL_CLASS}">${escapeHtml(value)}</span>${escapeHtml(close)}`;
}

/** Render the editor's innerHTML: marker-wrapped segments become pills. */
function renderHtml(text: string): string {
  return parseMarkers(text)
    .map((s) => (s.type === 'tag' ? tagHtml(s.value) : escapeHtml(s.value)))
    .join('');
}

/** Current caret offset (char index into the editor's text) or -1 if none. */
function getCaretOffset(el: HTMLElement): number {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return -1;
  const range = sel.getRangeAt(0);
  if (!el.contains(range.startContainer)) return -1;
  if (range.startContainer.nodeType === Node.TEXT_NODE) {
    const pre = range.cloneRange();
    pre.selectNodeContents(el);
    pre.setEnd(range.startContainer, range.startOffset);
    return pre.toString().length;
  }
  return 0;
}

/** Place the caret at the given text offset, or the end if out of range. */
function setCaretOffset(el: HTMLElement, offset: number) {
  el.focus();
  const sel = window.getSelection();
  if (!sel) return;
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  let remaining = offset;
  let node = walker.nextNode();
  while (node) {
    const len = (node.textContent ?? '').length;
    if (remaining <= len) {
      const range = document.createRange();
      range.setStart(node, remaining);
      range.collapse(true);
      sel.removeAllRanges();
      sel.addRange(range);
      return;
    }
    remaining -= len;
    node = walker.nextNode();
  }
  const end = document.createRange();
  end.selectNodeContents(el);
  end.collapse(false);
  sel.removeAllRanges();
  sel.addRange(end);
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

  const matches = useMemo(() => findDictionaryMatches(plainText, dictionary), [plainText, dictionary]);
  const taggedKeys = useMemo(
    () => new Set(findTaggedTerms(plainText).map(keyOf)),
    [plainText],
  );

  function handleInput() {
    const el = editorRef.current;
    if (!el) return;
    // textContent keeps the literal marker characters (_hiv_) so tags survive.
    setPlainText(el.textContent ?? '');
    setError(null);
  }

  function handleFocus() {
    const el = editorRef.current;
    if (!el) return;
    // Switch from pretty pills to raw marker text so the caret behaves exactly
    // like a plain textarea (type past a tag without polluting it). The raw view
    // is the same characters, so the caret offset is preserved.
    const offset = getCaretOffset(el);
    setEditing(true);
    el.innerHTML = escapeHtml(plainText);
    setCaretOffset(el, offset);
  }

  function handleBlur() {
    setEditing(false);
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
        onFocus={handleFocus}
        onBlur={handleBlur}
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