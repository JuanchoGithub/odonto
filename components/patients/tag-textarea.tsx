'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { addMedicalTag } from '@/server/actions/medical-tags';
import {
  MIN_TAG_LENGTH,
  stripPunct,
  keyOf,
  type MedicalTagField,
} from '@/lib/medical-tags';
import { cn } from '@/lib/utils';

/** Strip surrounding punctuation so "aspirin," matches the "aspirin" tag. */
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Build the editor's innerHTML: dictionary matches become chips, rest is free text. */
function tokenizeHtml(text: string, dictionary: string[]): string {
  const set = new Set(dictionary.map((d) => keyOf(d)));
  let out = '';
  let last = 0;
  const re = /\S+/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) out += escapeHtml(text.slice(last, m.index));
    const token = m[0];
    const core = keyOf(stripPunct(token));
    if (core.length >= MIN_TAG_LENGTH && set.has(core)) {
      out += `<span class="mx-0.5 inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 text-sm font-medium text-primary">${escapeHtml(token)}</span>`;
    } else {
      out += escapeHtml(token);
    }
    last = m.index + token.length;
  }
  if (last < text.length) out += escapeHtml(text.slice(last));
  return out;
}

/** Last word typed so far (for the "tag this word" suggestion). */
function lastWord(text: string): string {
  const words = text.trim().split(/\s+/);
  return stripPunct(words[words.length - 1] ?? '');
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
  const [pendingTerm, setPendingTerm] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dictSet = useMemo(() => new Set(dictionary.map((d) => keyOf(d))), [dictionary]);

  // Re-render chips whenever the text or dictionary changes, but NOT while the
  // user is actively editing (re-tokenizing mid-keystroke jumps the caret).
  useEffect(() => {
    if (editorRef.current && !editing) {
      editorRef.current.innerHTML = tokenizeHtml(plainText, dictionary);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plainText, dictionary, editing]);

  function handleInput() {
    const el = editorRef.current;
    if (!el) return;
    const text = el.innerText ?? el.textContent ?? '';
    setPlainText(text);
    const word = lastWord(text);
    setPendingTerm(
      word.length >= MIN_TAG_LENGTH && !dictSet.has(keyOf(word)) ? word : null,
    );
    setError(null);
  }

  async function handleTag() {
    if (!pendingTerm) return;
    setAdding(true);
    setError(null);
    const res = await addMedicalTag(name as MedicalTagField, pendingTerm);
    setAdding(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setPendingTerm(null);
    // Re-render chips in place (leave editing state alone; the word is already
    // in the text, so tokenization will highlight it).
    if (editorRef.current) {
      editorRef.current.innerHTML = tokenizeHtml(plainText, dictionary.concat(res.term));
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
        className="flex min-h-[80px] w-full cursor-text rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        suppressContentEditableWarning
        data-placeholder={placeholder}
      />
      {pendingTerm ? (
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={adding}
            onClick={handleTag}
            className="inline-flex min-h-[44px] items-center gap-1 rounded-full border border-input bg-background px-3 text-sm font-medium text-primary touch-manipulation disabled:opacity-50"
          >
            {adding ? t('addingTag') : t('tagThisWord', { word: pendingTerm })}
          </button>
        </div>
      ) : null}
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      <input type="hidden" name={name} value={plainText} />
    </div>
  );
}