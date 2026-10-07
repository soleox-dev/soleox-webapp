'use client';

import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { validateFormula, readExcelString, normalizeFormula } from './formula-validator';
import { explainFormula } from './formula-explainer';

const FORMULA_FUNCTION_GROUPS: { title: string; items: { name: string; signature: string; summary: string }[] }[] = [
  {
    title: 'Logic',
    items: [
      { name: 'IF', signature: 'IF(condition, if true, if false)', summary: 'Returns one value when the condition is true and the other when it is false.' },
      { name: 'IFERROR', signature: 'IFERROR(value, if error)', summary: 'Returns the second value when the first cannot be calculated.' },
      { name: 'AND', signature: 'AND(value1, value2, ...)', summary: 'True when every value is true.' },
      { name: 'OR', signature: 'OR(value1, value2, ...)', summary: 'True when any value is true.' },
      { name: 'NOT', signature: 'NOT(value)', summary: 'True when the value is false.' },
    ],
  },
  {
    title: 'Tests',
    items: [
      { name: 'ISNUMBER', signature: 'ISNUMBER(value)', summary: 'True when the value is a number.' },
      { name: 'ISNULL', signature: 'ISNULL(value)', summary: 'True when the value is blank. Zero and false are not blank.' },
    ],
  },
  {
    title: 'Math',
    items: [
      { name: 'MIN', signature: 'MIN(value1, value2, ...)', summary: 'The smallest number.' },
      { name: 'MAX', signature: 'MAX(value1, value2, ...)', summary: 'The largest number.' },
      { name: 'NUMBERVALUE', signature: 'NUMBERVALUE(text)', summary: 'Turns text such as $1,200 or 35% into a number.' },
    ],
  },
  {
    title: 'Text',
    items: [
      { name: 'LEN', signature: 'LEN(text)', summary: 'The number of characters.' },
      { name: 'TRIM', signature: 'TRIM(text)', summary: 'Removes extra spaces.' },
      { name: 'SUBSTITUTE', signature: 'SUBSTITUTE(text, old, new, instance)', summary: 'Replaces old text with new text. Instance is optional.' },
      { name: 'SEARCH', signature: 'SEARCH(find, within, start)', summary: 'The position of find inside within. Start is optional and begins at 1.' },
      { name: 'TEXTBEFORE', signature: 'TEXTBEFORE(text, delimiter, instance)', summary: 'The text before a delimiter. Instance is optional.' },
      { name: 'TEXTAFTER', signature: 'TEXTAFTER(text, delimiter, instance)', summary: 'The text after a delimiter. Instance is optional.' },
    ],
  },
  {
    title: 'Dates',
    items: [
      { name: 'YEAR', signature: 'YEAR(date)', summary: 'The calendar year of a date.' },
      { name: 'TODAY', signature: 'TODAY()', summary: "Today's date." },
    ],
  },
  {
    title: 'Lookup',
    items: [
      { name: 'XLOOKUP', signature: 'XLOOKUP(value, table.field, table.field)', summary: 'Finds a value in one column and returns the matching column.' },
      { name: 'SUMIFS', signature: 'SUMIFS(table.amount, table.field, criteria, ...)', summary: 'Adds amounts from other deals where each field matches its criteria.' },
      { name: 'COUNTIFS', signature: 'COUNTIFS(table.field, criteria, ...)', summary: 'Counts other deals where each field matches its criteria.' },
    ],
  },
];

export const FORMULA_FUNCTIONS = FORMULA_FUNCTION_GROUPS.flatMap((group) => group.items.map((item) => item.name));

function FormulaFunctionsButton({ onInsert }: { onInsert: (text: string) => void }) {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0, maxHeight: 360 });

  const place = () => {
    const rect = buttonRef.current?.getBoundingClientRect();
    if (!rect) return;
    const width = 380;
    const left = Math.min(Math.max(8, rect.right - width), window.innerWidth - width - 8);
    const spaceBelow = window.innerHeight - rect.bottom - 12;
    setPosition({
      top: rect.bottom + 6,
      left,
      maxHeight: Math.max(220, Math.min(440, spaceBelow)),
    });
  };

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => {
      const target = event.target as Node;
      if (buttonRef.current?.contains(target) || panelRef.current?.contains(target)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        aria-expanded={open}
        onClick={() => {
          place();
          setOpen((current) => !current);
        }}
        className="px-2 py-0.5 text-[10px] font-bold rounded border border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-200/70 dark:hover:bg-slate-700 cursor-pointer"
      >
        Functions
      </button>
      {open && createPortal(
        <div
          ref={panelRef}
          style={{ top: position.top, left: position.left, maxHeight: position.maxHeight }}
          className="fixed z-[200] flex w-[380px] flex-col overflow-hidden rounded-lg border border-slate-200 bg-white shadow-xl dark:border-slate-700 dark:bg-slate-800"
        >
          <div className="border-b border-slate-200 px-3 py-2 dark:border-slate-700">
            <p className="text-[11px] font-bold text-slate-700 dark:text-slate-200">Functions</p>
            <p className="mt-0.5 text-[10px] text-slate-500 dark:text-slate-400">Click a function to insert it. Comparisons use =, &lt;&gt;, &lt;, &lt;=, &gt;, and &gt;=.</p>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {FORMULA_FUNCTION_GROUPS.map((group) => (
              <section key={group.title}>
                <p className="sticky top-0 border-b border-slate-200 bg-slate-50 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wide text-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400">{group.title}</p>
                <ul>
                  {group.items.map((item) => (
                    <li key={item.name} className="border-b border-slate-100 last:border-b-0 dark:border-slate-700">
                      <button
                        type="button"
                        onMouseDown={(event) => {
                          event.preventDefault();
                          onInsert(`${item.name}(`);
                        }}
                        className="w-full px-3 py-2 text-left cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-900/60"
                      >
                        <span className="block font-mono text-[11px] font-semibold text-violet-700 dark:text-violet-300">{item.signature}</span>
                        <span className="mt-0.5 block text-[11px] leading-4 text-slate-600 dark:text-slate-300">{item.summary}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}

export interface FormulaName {
  name: string;
  label: string;
  kind: 'field' | 'parameter';
}

const TOKEN_CLASS = {
  function: 'font-semibold text-violet-700 dark:text-violet-300',
  variable: 'font-medium text-sky-700 dark:text-sky-300',
  string: 'text-amber-700 dark:text-amber-300',
  number: 'font-medium text-emerald-700 dark:text-emerald-300',
  operator: 'font-semibold text-rose-600 dark:text-rose-300',
  table: 'italic text-slate-500 dark:text-slate-400',
  plain: 'text-slate-800 dark:text-slate-100',
} as const;

type TokenKind = keyof typeof TOKEN_CLASS;

interface Token {
  text: string;
  kind: TokenKind;
}

function isIdentifierChar(char: string): boolean {
  return /[A-Za-z0-9_.]/.test(char);
}

function tokenize(source: string, names: Set<string>): Token[] {
  const tokens: Token[] = [];
  let index = 0;

  while (index < source.length) {
    const rest = source.slice(index);

    const whitespace = rest.match(/^\s+/);
    if (whitespace) {
      tokens.push({ text: whitespace[0], kind: 'plain' });
      index += whitespace[0].length;
      continue;
    }

    if (rest.startsWith('"')) {
      const text = readExcelString(source, index);
      const raw = text ? source.slice(index, text.end) : rest;
      tokens.push({ text: raw, kind: 'string' });
      index += raw.length;
      continue;
    }

    const number = rest.match(/^\d+(?:\.\d+)?%?/);
    if (number) {
      tokens.push({ text: number[0], kind: 'number' });
      index += number[0].length;
      continue;
    }

    const operator = rest.match(/^(<>|<=|>=|[=<>&])/);
    if (operator) {
      tokens.push({ text: operator[0], kind: 'operator' });
      index += operator[0].length;
      continue;
    }

    const identifier = rest.match(/^[A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)?/);
    if (identifier) {
      const text = identifier[0];
      const upper = text.toUpperCase();
      const next = source.slice(index + text.length).match(/^\s*\(/);
      if ((FORMULA_FUNCTIONS as readonly string[]).includes(upper) && next) {
        tokens.push({ text, kind: 'function' });
      } else if (text.toLowerCase().startsWith('transactions.') || text.toLowerCase().startsWith('agents.')) {
        const dot = text.indexOf('.');
        tokens.push({ text: text.slice(0, dot), kind: 'table' });
        tokens.push({ text: '.', kind: 'plain' });
        tokens.push({ text: text.slice(dot + 1), kind: 'variable' });
      } else if (names.has(text.toLowerCase())) {
        tokens.push({ text, kind: 'variable' });
      } else {
        tokens.push({ text, kind: 'plain' });
      }
      index += text.length;
      continue;
    }

    tokens.push({ text: rest[0], kind: 'plain' });
    index += 1;
  }

  return tokens;
}

export function FormulaHighlight({
  value,
  names,
  empty = 'Blank',
}: {
  value: string;
  names: FormulaName[];
  empty?: string;
}) {
  const known = useMemo(() => new Set(names.map((item) => item.name.toLowerCase())), [names]);
  if (!value.trim()) {
    return <span className="text-slate-400">{empty}</span>;
  }
  const tokens = tokenize(value, known);
  return (
    <span className="font-mono text-[11px] leading-relaxed whitespace-pre-wrap break-words">
      {tokens.map((token, index) => (
        <span key={`${index}-${token.text}`} className={TOKEN_CLASS[token.kind]}>
          {token.text}
        </span>
      ))}
    </span>
  );
}

export function FormulaPreview({
  value,
  names,
  empty = 'Blank',
}: {
  value: string;
  names: FormulaName[];
  empty?: string;
}) {
  const boxRef = useRef<HTMLDivElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [overflows, setOverflows] = useState(false);

  useLayoutEffect(() => {
    const box = boxRef.current;
    if (!box || expanded) return;
    setOverflows(box.scrollHeight > box.clientHeight + 1);
  }, [value, expanded]);

  return (
    <div className="min-w-0 flex-1">
      <div ref={boxRef} className={expanded ? '' : 'max-h-9 overflow-hidden'}>
        <FormulaHighlight value={value} names={names} empty={empty} />
      </div>
      {(overflows || expanded) && (
        <button
          type="button"
          onClick={() => setExpanded((open) => !open)}
          className="mt-1 text-[10px] font-bold text-emerald-700 dark:text-emerald-400 cursor-pointer"
        >
          {expanded ? 'Collapse' : 'Expand'}
        </button>
      )}
    </div>
  );
}

export function FormulaExplain({
  value,
  names,
}: {
  value: string;
  names: FormulaName[];
}) {
  const explanation = useMemo(() => explainFormula(value, names), [value, names]);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const closeTimer = useRef<number | null>(null);
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0, width: 480, maxHeight: 360, above: false });

  if (!value.trim() || !explanation) return null;

  const show = () => {
    if (closeTimer.current) window.clearTimeout(closeTimer.current);
    const rect = buttonRef.current?.getBoundingClientRect();
    if (!rect) return;
    const width = Math.min(520, window.innerWidth - 16);
    const left = Math.min(Math.max(8, rect.left), window.innerWidth - width - 8);
    const spaceBelow = window.innerHeight - rect.bottom - 16;
    const spaceAbove = rect.top - 16;
    const above = spaceBelow < 240 && spaceAbove > spaceBelow;
    setPosition({
      top: above ? rect.top - 8 : rect.bottom + 8,
      left,
      width,
      maxHeight: Math.max(180, (above ? spaceAbove : spaceBelow) - 8),
      above,
    });
    setOpen(true);
  };

  const hide = () => {
    closeTimer.current = window.setTimeout(() => setOpen(false), 150);
  };

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        aria-label="Read this formula in plain language"
        onMouseEnter={show}
        onMouseLeave={hide}
        onFocus={show}
        onBlur={hide}
        className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-slate-300 dark:border-slate-600 text-slate-500 dark:text-slate-300 hover:border-emerald-500 hover:text-emerald-700 dark:hover:text-emerald-300 cursor-pointer"
      >
        <svg viewBox="0 0 16 16" aria-hidden className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round">
          <path d="M1.8 2.6h12.4v8.2H6.4L3.2 13.6V10.8H1.8V2.6Z" />
        </svg>
      </button>
      {open && createPortal(
        <span
          role="tooltip"
          onMouseEnter={show}
          onMouseLeave={hide}
          style={{
            top: position.top,
            left: position.left,
            width: position.width,
            maxHeight: position.maxHeight,
            transform: position.above ? 'translateY(-100%)' : undefined,
          }}
          className="fixed z-[200] overflow-y-auto rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2.5 text-xs leading-relaxed text-slate-700 dark:text-slate-200 shadow-xl whitespace-pre-line"
        >
          {explanation}
        </span>,
        document.body,
      )}
    </>
  );
}

export function FormulaHint({ text }: { text: string }) {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0 });

  const show = () => {
    const rect = buttonRef.current?.getBoundingClientRect();
    if (!rect) return;
    setPosition({
      top: rect.bottom + 6,
      left: Math.min(rect.left, window.innerWidth - 304),
    });
    setOpen(true);
  };

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        aria-label={text}
        onMouseEnter={show}
        onMouseLeave={() => setOpen(false)}
        onFocus={show}
        onBlur={() => setOpen(false)}
        className="inline-flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full border border-slate-300 font-serif text-[9px] italic font-semibold leading-none text-slate-500 hover:border-emerald-500 hover:text-emerald-700 dark:border-slate-600 dark:text-slate-400 dark:hover:text-emerald-300 cursor-pointer"
      >
        i
      </button>
      {open && createPortal(
        <span
          role="tooltip"
          style={{ top: position.top, left: position.left }}
          className="fixed z-[200] w-max max-w-72 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] leading-relaxed text-slate-700 shadow-xl dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
        >
          {text}
        </span>,
        document.body,
      )}
    </>
  );
}

function currentWord(value: string, cursor: number): { start: number; text: string } {
  let start = cursor;
  while (start > 0 && isIdentifierChar(value[start - 1])) start -= 1;
  return { start, text: value.slice(start, cursor) };
}

export function FormulaEditor({
  value,
  onChange,
  names,
  fieldGroups = [],
  fieldsAside = false,
  fieldsOpen: fieldsOpenProp,
  containFields = false,
  showFieldsToggle = true,
  fitContent = false,
  onFieldsPanelChange,
  label = 'Formula',
  hint,
  emptyNote,
}: {
  value: string;
  onChange: (value: string) => void;
  names: FormulaName[];
  fieldGroups?: { id: string; title: string; fields: FormulaName[] }[];
  /** Place Fields and Parameters beside the formula instead of below it. */
  fieldsAside?: boolean;
  /** When set, the parent decides whether the side card is visible. */
  fieldsOpen?: boolean;
  /** Size the side card to the space left in the parent instead of a fixed width. */
  containFields?: boolean;
  /** Show the per-formula button that opens the side card. */
  showFieldsToggle?: boolean;
  /** Size the text box to the formula instead of a fixed height. */
  fitContent?: boolean;
  onFieldsPanelChange?: (open: boolean) => void;
  label?: string;
  hint?: string;
  emptyNote?: string;
}) {
  const areaRef = useRef<HTMLTextAreaElement>(null);
  const highlightRef = useRef<HTMLPreElement>(null);
  const cursorAfterChange = useRef<number | null>(null);
  const [cursor, setCursor] = useState(0);
  const [suggestionIndex, setSuggestionIndex] = useState(0);
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [boxHeight, setBoxHeight] = useState(144);
  const [activeGroup, setActiveGroup] = useState(fieldGroups[0]?.id || '');
  const [fieldQuery, setFieldQuery] = useState('');
  const [fieldsOpenState, setFieldsOpenState] = useState(false);
  const [matchedTextHeight, setMatchedTextHeight] = useState(0);
  const [contentHeight, setContentHeight] = useState(40);
  const fieldsCardRef = useRef<HTMLDivElement>(null);
  const formulaShellRef = useRef<HTMLDivElement>(null);
  const suggestionAnchorRef = useRef<HTMLDivElement>(null);
  const [suggestionBox, setSuggestionBox] = useState({ top: 0, left: 0, width: 0, maxHeight: 240, above: false });
  const fieldsOpen = fieldsOpenProp ?? fieldsOpenState;

  const setFieldsPanel = (open: boolean) => {
    if (fieldsOpenProp === undefined) setFieldsOpenState(open);
    onFieldsPanelChange?.(open);
  };

  const known = useMemo(() => new Set(names.map((item) => item.name.toLowerCase())), [names]);
  const tokens = useMemo(() => tokenize(value, known), [value, known]);
  const formulaIssue = useMemo(
    () => validateFormula(value, names.map((item) => item.name)),
    [value, names]
  );
  const word = currentWord(value, cursor);

  const completionMatches = useMemo(() => {
    const query = word.text.toLowerCase();
    if (query.length === 0) return [];
    const functions = FORMULA_FUNCTIONS
      .filter((name) => name.toLowerCase().startsWith(query))
      .map((name) => ({ insert: `${name}(`, label: name, detail: 'Function' }));
    const variables = names
      .filter((item) => item.name.toLowerCase().startsWith(query) || item.label.toLowerCase().includes(query))
      .slice(0, 8)
      .map((item) => ({ insert: item.name, label: item.name, detail: item.label }));
    return [...functions, ...variables].slice(0, 10);
  }, [names, word.text]);
  const suggestions = suggestionsOpen ? completionMatches : [];

  useLayoutEffect(() => {
    if (suggestions.length === 0) return;
    const anchor = suggestionAnchorRef.current;
    if (!anchor) return;
    const place = () => {
      const rect = anchor.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom - 12;
      const spaceAbove = rect.top - 12;
      const above = spaceBelow < 180 && spaceAbove > spaceBelow;
      const next = {
        top: above ? rect.top - 6 : rect.bottom + 6,
        left: rect.left,
        width: rect.width,
        maxHeight: Math.max(120, Math.min(280, above ? spaceAbove : spaceBelow)),
        above,
      };
      setSuggestionBox((current) => (
        current.top === next.top && current.left === next.left && current.width === next.width
          && current.maxHeight === next.maxHeight && current.above === next.above
          ? current
          : next
      ));
    };
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [suggestions.length, word.text, value]);

  const publishFormula = (raw: string, rawCursor: number) => {
    const normalized = normalizeFormula(raw, rawCursor);
    cursorAfterChange.current = normalized.cursor;
    onChange(normalized.text);
    setCursor(normalized.cursor);
  };

  useLayoutEffect(() => {
    const area = areaRef.current;
    const nextCursor = cursorAfterChange.current;
    if (!area || nextCursor === null) return;
    cursorAfterChange.current = null;
    area.focus();
    area.setSelectionRange(nextCursor, nextCursor);
  }, [value]);

  const insertText = (insert: string, replaceStart = cursor, replaceEnd = cursor) => {
    const next = value.slice(0, replaceStart) + insert + value.slice(replaceEnd);
    publishFormula(next, replaceStart + insert.length);
    setSuggestionsOpen(false);
  };

  const applySuggestion = (insert: string) => {
    insertText(insert, word.start, cursor);
  };

  useLayoutEffect(() => {
    if (!expanded || !areaRef.current) return;
    const needed = Math.max(areaRef.current.scrollHeight, 160);
    setBoxHeight((current) => (Math.abs(current - needed) > 2 ? needed : current));
  }, [value, expanded, boxHeight]);

  useLayoutEffect(() => {
    if (!fitContent || expanded) return;
    const area = areaRef.current;
    const parent = area?.parentElement;
    if (!area || !parent) return;
    const previousHeight = parent.style.height;
    parent.style.height = 'auto';
    area.style.position = 'relative';
    area.style.inset = 'auto';
    area.style.height = 'auto';
    const next = Math.max(area.scrollHeight, 40);
    area.style.position = '';
    area.style.inset = '';
    area.style.height = '';
    parent.style.height = previousHeight;
    setContentHeight((current) => (Math.abs(current - next) > 1 ? next : current));
  }, [fitContent, expanded, value]);

  useLayoutEffect(() => {
    const card = fieldsCardRef.current;
    const shell = formulaShellRef.current;
    if (!fieldsAside || !fieldsOpen || !card || !shell) {
      setMatchedTextHeight(0);
      return;
    }
    const measure = () => {
      const text = shell.querySelector<HTMLElement>('[data-formula-text]');
      if (!text) return;
      const delta = card.getBoundingClientRect().bottom - shell.getBoundingClientRect().bottom;
      const next = Math.max(96, Math.round(text.getBoundingClientRect().height + delta));
      setMatchedTextHeight((current) => (Math.abs(current - next) > 1 ? next : current));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(card);
    return () => observer.disconnect();
  }, [fieldsAside, containFields, fieldsOpen, activeGroup, fieldQuery, value, expanded]);

  const selectedGroup = fieldGroups.find((group) => group.id === activeGroup) || fieldGroups[0];
  const visibleFields = (selectedGroup?.fields || []).filter((field) => {
    const query = fieldQuery.trim().toLowerCase();
    if (!query) return true;
    return field.name.toLowerCase().includes(query) || field.label.toLowerCase().includes(query);
  });
  const textBoxHeight = expanded
    ? Math.max(boxHeight, matchedTextHeight || 128)
    : matchedTextHeight || (fitContent ? contentHeight : null);

  const fieldsCard = fieldGroups.length > 0 && (!fieldsAside || fieldsOpen) ? (
        <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800">
          <div className="border-b border-slate-200 px-3 py-2 dark:border-slate-700">
            <p className="whitespace-nowrap text-[11px] font-bold text-slate-700 dark:text-slate-200">Fields and Parameters</p>
            <div className="mt-1.5 flex flex-nowrap gap-1">
              {fieldGroups.map((group) => (
                <button
                  key={group.id}
                  type="button"
                  onClick={() => setActiveGroup(group.id)}
                  className={`px-2 py-1 rounded text-[10px] font-bold cursor-pointer ${
                    selectedGroup?.id === group.id
                      ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                      : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                  }`}
                >
                  {group.title}
                </button>
              ))}
            </div>
          </div>
          <div className="p-2">
            <label className="group/field underline-field mb-2 block rounded-t-md border-b border-b-slate-300 px-2.5 pt-1 pb-0.5 transition-colors focus-within:border-b-emerald-500 focus-within:shadow-[0_1px_0_rgb(16_185_129/0.45),0_6px_12px_-6px_rgb(16_185_129/0.8)] dark:border-b-slate-600">
              <span className="block truncate text-[10px] leading-3 font-medium text-slate-500 group-focus-within/field:text-emerald-600 dark:text-slate-400 dark:group-focus-within/field:text-emerald-400">Search</span>
              <input
                value={fieldQuery}
                onChange={(event) => setFieldQuery(event.target.value)}
                placeholder="Fields and parameters"
                className="h-5 w-full border-0 bg-transparent p-0 text-xs font-medium text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-0 dark:text-white dark:placeholder:text-slate-500"
              />
            </label>
            <ul className="max-h-40 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-700">
              {visibleFields.length === 0 ? (
                <li className="px-2 py-2 text-[11px] text-slate-400">Nothing matches.</li>
              ) : visibleFields.map((field) => (
                <li key={field.name}>
                  <button
                    type="button"
                    onMouseDown={(event) => {
                      event.preventDefault();
                      const area = areaRef.current;
                      insertText(field.name, area?.selectionStart ?? cursor, area?.selectionEnd ?? cursor);
                    }}
                    className="flex w-full min-w-0 items-center justify-between gap-3 px-2 py-1.5 text-left cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-900/60"
                  >
                    <span className="min-w-0 truncate text-xs text-slate-800 dark:text-slate-100">{field.label}</span>
                    <span className="shrink-0 font-mono text-[11px] text-sky-700 dark:text-sky-300">{field.name}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>
  ) : null;

  const formulaColumn = (
    <div className={`min-w-0 space-y-2 ${fieldsAside && !containFields ? 'w-full max-w-[39rem] shrink-0' : ''}`}>
      <div ref={formulaShellRef} className="group/field underline-field rounded-t-md border-b border-b-slate-300 transition-colors focus-within:border-b-emerald-500 focus-within:shadow-[0_1px_0_rgb(16_185_129/0.45),0_6px_12px_-6px_rgb(16_185_129/0.8)] dark:border-b-slate-600">
      <div className="flex items-center justify-between gap-2 px-2.5 pt-1">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="truncate text-[10px] leading-3 font-medium text-slate-500 group-focus-within/field:text-emerald-600 dark:text-slate-400 dark:group-focus-within/field:text-emerald-400">{label}</span>
          {hint && <FormulaHint text={hint} />}
          <FormulaExplain value={value} names={names} />
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <FormulaFunctionsButton
            onInsert={(text) => {
              const area = areaRef.current;
              insertText(text, area?.selectionStart ?? cursor, area?.selectionEnd ?? cursor);
            }}
          />
          {fieldsAside && showFieldsToggle && fieldGroups.length > 0 && (
            <button
              type="button"
              aria-expanded={fieldsOpen}
              onClick={() => setFieldsPanel(!fieldsOpen)}
              className="px-2 py-0.5 text-[10px] font-bold rounded border border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-200/70 dark:hover:bg-slate-700 cursor-pointer"
            >
              {fieldsOpen ? 'Hide fields' : 'Fields'}
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              if (expanded) {
                setExpanded(false);
                return;
              }
              const needed = Math.max(areaRef.current?.scrollHeight || 0, 160);
              setBoxHeight(needed);
              setExpanded(true);
            }}
            className="px-2 py-0.5 text-[10px] font-bold rounded border border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-200/70 dark:hover:bg-slate-700 cursor-pointer"
          >
            {expanded ? 'Collapse' : 'Expand'}
          </button>
        </div>
      </div>
      <div
        ref={suggestionAnchorRef}
        data-formula-text
        className={`relative overflow-hidden ${textBoxHeight === null ? 'h-32' : ''}`}
        style={textBoxHeight === null ? undefined : { height: textBoxHeight }}
      >
        <pre
          ref={highlightRef}
          aria-hidden
          className="absolute inset-0 m-0 overflow-hidden p-2 font-mono text-xs leading-5 whitespace-pre-wrap break-words pointer-events-none [tab-size:2]"
        >
          {tokens.map((token, index) => (
            <span key={`${index}-${token.text}`} className={TOKEN_CLASS[token.kind]}>
              {token.text}
            </span>
          ))}
          {value.endsWith('\n') ? '\n' : ''}
        </pre>
        <textarea
          ref={areaRef}
          value={value}
          spellCheck={false}
          onScroll={(event) => {
            if (highlightRef.current) {
              highlightRef.current.scrollTop = event.currentTarget.scrollTop;
              highlightRef.current.scrollLeft = event.currentTarget.scrollLeft;
            }
          }}
          onChange={(event) => {
            publishFormula(event.target.value, event.target.selectionStart);
            setSuggestionsOpen(true);
            setSuggestionIndex(0);
          }}
          onClick={(event) => {
            setCursor(event.currentTarget.selectionStart);
            setSuggestionsOpen(true);
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              insertText('\n', event.currentTarget.selectionStart, event.currentTarget.selectionEnd);
              return;
            }
            if (event.key === 'Tab' && !event.shiftKey) {
              event.preventDefault();
              if (completionMatches.length > 0) {
                const index = Math.min(suggestionIndex, completionMatches.length - 1);
                applySuggestion(completionMatches[index].insert);
              } else {
                insertText('\t', event.currentTarget.selectionStart, event.currentTarget.selectionEnd);
              }
              return;
            }
            if (suggestions.length === 0) return;
            if (event.key === 'ArrowDown') {
              event.preventDefault();
              setSuggestionIndex((index) => (index + 1) % suggestions.length);
            } else if (event.key === 'ArrowUp') {
              event.preventDefault();
              setSuggestionIndex((index) => (index - 1 + suggestions.length) % suggestions.length);
            } else if (event.key === 'Escape') {
              setSuggestionsOpen(false);
            }
          }}
          className={`absolute inset-0 h-full w-full resize-none bg-transparent p-2 font-mono text-xs leading-5 [tab-size:2] text-transparent caret-slate-900 dark:caret-white focus:outline-none ${expanded ? 'overflow-hidden' : 'overflow-auto'}`}
        />
      </div>
      </div>

      {suggestions.length > 0 && createPortal(
        <ul
          style={{
            top: suggestionBox.top,
            left: suggestionBox.left,
            width: suggestionBox.width,
            maxHeight: suggestionBox.maxHeight,
            transform: suggestionBox.above ? 'translateY(-100%)' : undefined,
          }}
          className="fixed z-[220] overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-lg dark:border-slate-700 dark:bg-slate-800"
        >
          {suggestions.map((suggestion, index) => (
            <li key={`${suggestion.detail}-${suggestion.label}`}>
              <button
                type="button"
                onMouseDown={(event) => {
                  event.preventDefault();
                  applySuggestion(suggestion.insert);
                }}
                className={`w-full px-3 py-1.5 flex items-center justify-between gap-3 text-left text-xs cursor-pointer ${
                  index === suggestionIndex ? 'bg-emerald-500/10 text-emerald-800 dark:text-emerald-300' : 'text-slate-700 dark:text-slate-200'
                }`}
              >
                <span className="font-mono font-medium">{suggestion.label}</span>
                <span className="flex items-center gap-2 text-[10px] uppercase tracking-wide text-slate-400">
                  <span>{suggestion.detail}</span>
                  {index === suggestionIndex && <span className="font-bold text-emerald-700 dark:text-emerald-400">Tab</span>}
                </span>
              </button>
            </li>
          ))}
        </ul>,
        document.body,
      )}

      {value.trim() ? (
        <p className={`text-[11px] ${formulaIssue ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-700 dark:text-emerald-400'}`}>
          {formulaIssue || 'Formula is valid.'}
        </p>
      ) : emptyNote ? (
        <p className="text-[11px] text-slate-500 dark:text-slate-400">{emptyNote}</p>
      ) : null}

      <p className="text-[10px] text-slate-500 dark:text-slate-400 flex flex-wrap gap-x-3 gap-y-1">
        <span><span className={TOKEN_CLASS.function}>IF</span> function</span>
        <span><span className={TOKEN_CLASS.variable}>lead_source</span> field or parameter</span>
        <span><span className={TOKEN_CLASS.string}>"Yes"</span> text</span>
        <span><span className={TOKEN_CLASS.number}>35%</span> number</span>
      </p>

      {!fieldsAside && fieldsCard}
    </div>
  );

  if (!fieldsAside) return formulaColumn;

  return (
    <div className={containFields
      ? 'grid w-full min-w-0 items-start gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(16rem,22rem)]'
      : 'flex items-start gap-4'}
    >
      {formulaColumn}
      {fieldsOpen && fieldsCard && (
        <div ref={fieldsCardRef} className={containFields ? 'min-w-0' : 'w-[32rem] shrink-0'}>{fieldsCard}</div>
      )}
    </div>
  );
}
