/**
 * must: the brief an AI fetches from the site asks for the same draft format and method rules as the task the app
 *       copies, takes topic and language from the chat, and tells the AI how to hand the result back: the JSON, a
 *       link `<site>#draft=<percent-encoded JSON>` only under the length limit, and `<site>#ai-import` for pasting;
 *       a draft link's JSON is read back exactly (non-ASCII included), a fragment that does not decode is taken as
 *       written, any other fragment is not a draft link; a reply pasted inside a Markdown fence loses only the
 *       fence (S-15, owner 2026-11-20)
 * test: tests/unit/ai-brief.test.ts
 * red-against: the brief naming v2 or a fixed language, the link built without the site address, a draft link
 *              decoded as Latin-1 so ä breaks, a malformed % making the link throw, `#join=` read as a draft,
 *              the fence stripper eating JSON that merely contains backticks
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  DRAFT_EXAMPLE,
  buildDraftPrompt,
  buildFetchedBrief,
  draftFromLink,
  unfenced,
} from '../../src/domain/index.ts';

test('the fetched brief carries the format, the shared rules and the way back', () => {
  const brief = buildFetchedBrief({ siteUrl: 'https://example.org/witt/' });
  assert.ok(brief.includes('witt-ai-draft-v3'));
  assert.equal(brief.split('witt-ai-draft-v2').length, 1);
  assert.equal(brief.includes('Return the document in language'), false);
  assert.ok(brief.includes('Write the document in the language the user writes in.'));
  assert.ok(brief.includes('https://example.org/witt/#draft= followed by'));
  assert.ok(brief.includes('under 8000 characters'));
  assert.ok(brief.includes('https://example.org/witt/#ai-import'));
  assert.equal(brief.includes('WITT_URL'), false);
  // The method rules are the copied task's, word for word.
  const rule = 'Do not rate decision alternatives, subjective values, mandatory conditions';
  assert.ok(buildDraftPrompt().includes(rule));
  assert.ok(brief.includes(rule));
  assert.ok(brief.includes('Use two rating axes only'));
});

test('without a site address the brief tells the AI to derive it', () => {
  const brief = buildFetchedBrief();
  assert.ok(
    brief.includes(
      'WITT_URL below is the address this brief was fetched from, without the trailing "ai.txt".'
    )
  );
  assert.ok(brief.includes('WITT_URL#draft='));
  assert.ok(brief.includes('WITT_URL#ai-import'));
});

test('a draft link gives back its JSON; other fragments are not draft links', () => {
  const json = JSON.stringify({ ...DRAFT_EXAMPLE, title: 'Etätyö vai lähityö? 100 % & "lainaus"' });
  assert.equal(draftFromLink('#draft=' + encodeURIComponent(json)), json);
  assert.equal(draftFromLink('#draft={"a":"50 % varma"}'), '{"a":"50 % varma"}');
  assert.equal(draftFromLink('#draft=' + encodeURIComponent('```json\n{"a":1}\n```')), '{"a":1}');
  assert.equal(draftFromLink('#join=abc'), null);
  assert.equal(draftFromLink('#ai-import'), null);
  assert.equal(draftFromLink(''), null);
});

test('only a surrounding Markdown fence is removed', () => {
  assert.equal(unfenced('```json\n{"a":1}\n```'), '{"a":1}');
  assert.equal(unfenced('  ```\n{"a":1}\n```  \n'), '{"a":1}');
  assert.equal(unfenced('{"a":"``` inside"}'), '{"a":"``` inside"}');
  assert.equal(unfenced('{"a":1}'), '{"a":1}');
});
