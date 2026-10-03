'use client';

import React, { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { validateFormula, readExcelString, normalizeFormula } from './formula-validator';
import { explainFormula } from './formula-explainer';

export const FORMULA_FUNCTIONS = ['IF', 'AND', 'OR', 'COUNTIFS', 'ISNUMBER', 'NUMBERVALUE', 'SEARCH', 'TEXTAFTER', 'TEXTBEFORE', 'TRIM', 'SUBSTITUTE', 'XLOOKUP'] as const;

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
}: {
  value: string;
  names: FormulaName[];
}) {
  const known = useMemo(() => new Set(names.map((item) => item.name.toLowerCase())), [names]);
  if (!value.trim()) {
    return <span className="text-slate-400">Blank</span>;
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
}: {
  value: string;
  names: FormulaName[];
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
        <FormulaHighlight value={value} names={names} />
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
  showFieldsToggle = true,
  onFieldsPanelChange,
}: {
  value: string;
  onChange: (value: string) => void;
  names: FormulaName[];
  fieldGroups?: { id: string; title: string; fields: FormulaName[] }[];
  /** Place Fields and Parameters beside the formula instead of below it. */
  fieldsAside?: boolean;
  /** When set, the parent decides whether the side card is visible. */
  fieldsOpen?: boolean;
  /** Show the per-formula button that opens the side card. */
  showFieldsToggle?: boolean;
  onFieldsPanelChange?: (open: boolean) => void;
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

  const selectedGroup = fieldGroups.find((group) => group.id === activeGroup) || fieldGroups[0];
  const visibleFields = (selectedGroup?.fields || []).filter((field) => {
    const query = fieldQuery.trim().toLowerCase();
    if (!query) return true;
    return field.name.toLowerCase().includes(query) || field.label.toLowerCase().includes(query);
  });

  const fieldsCard = fieldGroups.length > 0 && (!fieldsAside || fieldsOpen) ? (
        <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800">
          <div className="px-3 py-2 border-b border-slate-200 dark:border-slate-700 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <p className="text-[11px] font-bold text-slate-700 dark:text-slate-200">Fields and Parameters</p>
            <div className="flex gap-1 flex-wrap">
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
                    className="w-full px-2 py-1.5 flex items-center justify-between gap-3 text-left cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-900/60"
                  >
                    <span className="text-xs text-slate-800 dark:text-slate-100">{field.label}</span>
                    <span className="font-mono text-[11px] text-sky-700 dark:text-sky-300">{field.name}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>
  ) : null;

  const formulaColumn = (
    <div className={`min-w-0 space-y-2 ${fieldsAside ? 'w-full max-w-[39rem] shrink-0' : ''}`}>
      <div className="group/field underline-field rounded-t-md border-b border-b-slate-300 transition-colors focus-within:border-b-emerald-500 focus-within:shadow-[0_1px_0_rgb(16_185_129/0.45),0_6px_12px_-6px_rgb(16_185_129/0.8)] dark:border-b-slate-600">
      <div className="flex items-center justify-between gap-2 px-2.5 pt-1">
        <div className="flex items-center gap-2 min-w-0">
          <span className="truncate text-[10px] leading-3 font-medium text-slate-500 group-focus-within/field:text-emerald-600 dark:text-slate-400 dark:group-focus-within/field:text-emerald-400">Formula</span>
          <FormulaExplain value={value} names={names} />
        </div>
        <div className="flex shrink-0 items-center gap-1">
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
        className={`relative ${expanded ? 'overflow-hidden' : 'h-32 overflow-hidden'}`}
        style={expanded ? { height: boxHeight } : undefined}
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

      {suggestions.length > 0 && (
        <ul className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-lg overflow-hidden">
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
        </ul>
      )}

      {value.trim() && (
        <p className={`text-[11px] ${formulaIssue ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-700 dark:text-emerald-400'}`}>
          {formulaIssue || 'Formula is valid.'}
        </p>
      )}

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
    <div className="flex items-start gap-4">
      {formulaColumn}
      {fieldsOpen && fieldsCard && (
        <div className="w-[32rem] shrink-0">{fieldsCard}</div>
      )}
    </div>
  );
}
