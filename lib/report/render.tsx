import 'server-only';
// Explicit, even though nothing below refers to `React` by name: this file is
// JSX compiled to React.createElement calls in some execution paths (it broke
// PDF downloads outright — "ReferenceError: React is not defined" — the
// moment the classic JSX transform was in play instead of the automatic one).
// Importing it is the standard, harmless-either-way fix.
import React from 'react';
import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  renderToBuffer,
} from '@react-pdf/renderer';
import type { SessionDoc } from '@/lib/db/models';
import type { Turn } from '@/lib/db/repositories/turns';

/**
 * PRD §10 — the PDF report.
 *
 * Print is a different medium from the screen: no dark mode, no interaction, no
 * colour-only meaning. So this is not a screenshot of the results page — it is
 * laid out for paper, in ink on white, with every score stated as a number.
 */

const ink = '#14171C';
const muted = '#5A626E';
const line = '#D8DCE3';
const accent = '#2B4FBF';

const s = StyleSheet.create({
  page: { paddingTop: 48, paddingBottom: 56, paddingHorizontal: 52, fontSize: 10, color: ink, lineHeight: 1.5 },
  eyebrow: { fontSize: 8, color: muted, letterSpacing: 1, textTransform: 'uppercase' },
  h1: { fontSize: 22, marginTop: 6, fontWeight: 'bold' },
  // Explicit flex-basis on both sides, not just `justifyContent: space-between`
  // on two auto-sized children — that was the actual bug: a long role title
  // (e.g. "Senior Backend Engineer — Payments Platform") had nothing capping
  // its width, so it grew into the score block instead of wrapping under it.
  headerRow: { flexDirection: 'row', alignItems: 'flex-end' },
  headerLeft: { flex: 1, paddingRight: 16 },
  headerRight: { flexShrink: 0, minWidth: 70, alignItems: 'flex-end' },
  score: { fontSize: 34, fontWeight: 'bold' },
  scoreLabel: { fontSize: 8, color: muted, textAlign: 'right' },
  rule: { borderBottomWidth: 1, borderBottomColor: line, marginVertical: 18 },
  h2: { fontSize: 12, fontWeight: 'bold', marginBottom: 8 },
  body: { fontSize: 10, marginBottom: 4 },
  mutedText: { fontSize: 9, color: muted },
  barRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
  barLabel: { width: 78, fontSize: 9, color: muted },
  barTrack: { flex: 1, height: 6, backgroundColor: '#EDEFF3', borderRadius: 3 },
  barFill: { height: 6, backgroundColor: accent, borderRadius: 3 },
  barValue: { width: 30, fontSize: 9, textAlign: 'right', fontWeight: 'bold' },
  listItem: { flexDirection: 'row', marginBottom: 5 },
  bullet: { width: 12, color: muted },
  turn: { marginBottom: 16, breakInside: 'avoid' },
  turnHead: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 3 },
  question: { fontSize: 10, fontWeight: 'bold', flex: 1, paddingRight: 12 },
  turnScore: { fontSize: 13, fontWeight: 'bold' },
  quote: { fontSize: 9, color: muted, paddingLeft: 10, borderLeftWidth: 2, borderLeftColor: line, marginVertical: 5 },
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 3 },
  meta: { fontSize: 8, color: muted, marginRight: 14 },
  footer: { position: 'absolute', bottom: 28, left: 52, right: 52, flexDirection: 'row', justifyContent: 'space-between' },
  footerText: { fontSize: 8, color: muted },
});

function Bar({ label, value }: { label: string; value: number }) {
  const pct = Math.max(0, Math.min(100, value));
  return (
    <View style={s.barRow}>
      <Text style={s.barLabel}>{label}</Text>
      <View style={s.barTrack}>
        <View style={[s.barFill, { width: `${pct}%` }]} />
      </View>
      <Text style={s.barValue}>{Math.round(value)}</Text>
    </View>
  );
}

function Bullets({ items, marker }: { items: string[]; marker: string }) {
  return (
    <>
      {items.map((item, i) => (
        <View key={item} style={s.listItem}>
          <Text style={s.bullet}>{marker === '#' ? `${i + 1}.` : marker}</Text>
          <Text style={{ flex: 1 }}>{item}</Text>
        </View>
      ))}
    </>
  );
}

export async function renderReport({
  interview,
  turns,
}: {
  interview: SessionDoc;
  turns: Turn[];
}): Promise<Buffer> {
  const sub = interview.subScores ?? { relevance: 0, clarity: 0, structure: 0, pace: 0 };
  const anyTyped = turns.some((t) => t.inputMode === 'text');

  const doc = (
    <Document
      title={`Interview report — ${interview.roleTitle}`}
      author="Interview Simulator"
      subject={`Mock interview performance, ${interview.level} level`}
    >
      <Page size="A4" style={s.page}>
        <View style={s.headerRow}>
          <View style={s.headerLeft}>
            <Text style={s.eyebrow}>Mock interview report</Text>
            <Text style={s.h1}>{interview.roleTitle}</Text>
            <Text style={s.mutedText}>
              {interview.level} level · {interview.startedAt.toLocaleDateString('en-GB', {
                day: 'numeric',
                month: 'long',
                year: 'numeric',
              })}
              {interview.durationSec ? ` · ${Math.round(interview.durationSec / 60)} minutes` : ''}
            </Text>
          </View>
          <View style={s.headerRight}>
            <Text style={s.score}>{Math.round(interview.overallScore ?? 0)}</Text>
            <Text style={s.scoreLabel}>out of 100</Text>
          </View>
        </View>

        <View style={s.rule} />

        {interview.summary ? (
          <>
            <Text style={s.h2}>Overall</Text>
            <Text style={s.body}>{interview.summary}</Text>
            <View style={s.rule} />
          </>
        ) : null}

        <Text style={s.h2}>Score breakdown</Text>
        <Bar label="Relevance" value={sub.relevance} />
        <Bar label="Clarity" value={sub.clarity} />
        <Bar label="Structure" value={sub.structure} />
        <Bar label="Pace" value={sub.pace} />
        <Text style={[s.mutedText, { marginTop: 6 }]}>
          Weighted: relevance 40%, clarity 25%, structure 20%, pace 15%. Pace scores 100 between 120
          and 160 words per minute.
          {anyTyped ? ' Typed answers are excluded from the pace average.' : ''}
        </Text>

        <View style={s.rule} />

        {interview.strengths.length > 0 && (
          <>
            <Text style={s.h2}>What worked</Text>
            <Bullets items={interview.strengths} marker="•" />
            <View style={{ height: 10 }} />
          </>
        )}

        {interview.improvements.length > 0 && (
          <>
            <Text style={s.h2}>What to work on</Text>
            <Bullets items={interview.improvements} marker="#" />
          </>
        )}

        {interview.difficultyChanges.length > 0 && (
          <>
            <View style={s.rule} />
            <Text style={s.h2}>How the interview adapted</Text>
            {interview.difficultyChanges.map((c) => (
              <Text key={`${c.turnIndex}-${c.to}`} style={s.mutedText}>
                After question {c.turnIndex + 1}: {c.from} → {c.to} ({c.trigger})
              </Text>
            ))}
          </>
        )}

        <View style={s.footer} fixed>
          <Text style={s.footerText}>
            Generated {new Date().toLocaleDateString('en-GB')} · Audio was never recorded
          </Text>
          <Text style={s.footerText} render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} />
        </View>
      </Page>

      <Page size="A4" style={s.page}>
        <Text style={s.h2}>Question by question</Text>
        <View style={{ height: 6 }} />

        {turns.map((turn) => (
          <View key={turn.id} style={s.turn} wrap={false}>
            <View style={s.turnHead}>
              <Text style={s.question}>
                {turn.index + 1}. {turn.questionText}
              </Text>
              <Text style={s.turnScore}>{Math.round(turn.scores.total)}</Text>
            </View>

            <Text style={s.mutedText}>
              {turn.difficulty}
              {turn.isFollowUp ? ' · follow-up' : ''}
              {turn.groundedIn.length > 0 ? ' · grounded in your CV' : ''}
              {turn.inputMode === 'text' ? ' · typed' : ''}
            </Text>

            <Text style={s.quote}>{turn.transcript}</Text>

            {turn.feedback ? <Text style={s.body}>{turn.feedback}</Text> : null}

            <View style={s.metaRow}>
              <Text style={s.meta}>Relevance {turn.scores.relevance}</Text>
              <Text style={s.meta}>Clarity {turn.scores.clarity}</Text>
              <Text style={s.meta}>Structure {turn.scores.structure}</Text>
              {turn.metrics.wpm !== null && <Text style={s.meta}>{turn.metrics.wpm} wpm</Text>}
              <Text style={s.meta}>{turn.metrics.wordCount} words</Text>
              {turn.metrics.fillerCount > 0 && (
                <Text style={s.meta}>{turn.metrics.fillerCount} fillers</Text>
              )}
            </View>
          </View>
        ))}

        <View style={s.footer} fixed>
          <Text style={s.footerText}>Interview Simulator</Text>
          <Text style={s.footerText} render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );

  return renderToBuffer(doc);
}
