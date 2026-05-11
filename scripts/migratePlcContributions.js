/**
 * One-time migration: backfill `/plcs/{plcId}/contributions/*` from the
 * existing per-teacher `quiz_sessions/{sessionId}/responses` data so the
 * Firestore-native PlcTab has content the moment it ships, instead of
 * waiting for every member to re-open her results and trigger the auto-
 * publish path.
 *
 * Safe to re-run — contribution doc ids are deterministic
 * (`{quizId}_{teacherUid}`) and `setDoc` overwrites, so every run produces
 * the same end state. The first time any member opens her QuizResults
 * after this migration, the client-side auto-publish will overwrite her
 * contribution with the canonical (production-grader) version anyway, so
 * the migration's "good-enough" grading (MC exact match, FIB case-
 * insensitive trim, everything else = 0) is acceptable as a bootstrap.
 *
 * Usage:
 *   node scripts/migratePlcContributions.js [--dry-run] [--plc=<id>] [--member=<uid>]
 *
 * Requires firebase-admin credentials:
 *   - FIREBASE_SERVICE_ACCOUNT env var (JSON string), OR
 *   - scripts/service-account-key.json file (gitignored)
 *
 * Outputs:
 *   - A JSON report at scripts/output/plc-migration-{timestamp}.json
 *   - Stderr summary to console
 */

import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync, mkdirSync, writeFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const PLC_CONTRIBUTION_SCHEMA_VERSION = 1;

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const plcFilter =
  args.find((a) => a.startsWith('--plc='))?.split('=')[1] ?? null;
const memberFilter =
  args.find((a) => a.startsWith('--member='))?.split('=')[1] ?? null;

function loadCredentials() {
  const envCreds = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (envCreds) {
    try {
      return JSON.parse(envCreds);
    } catch (e) {
      throw new Error(
        `FIREBASE_SERVICE_ACCOUNT env var is set but not valid JSON: ${e.message}`
      );
    }
  }
  const filePath = join(__dirname, 'service-account-key.json');
  if (!existsSync(filePath)) {
    throw new Error(
      `No credentials. Set FIREBASE_SERVICE_ACCOUNT env var or place service-account-key.json in scripts/.`
    );
  }
  return JSON.parse(readFileSync(filePath, 'utf8'));
}

/**
 * "Good enough" grader for the migration bootstrap. Handles the MC and
 * FIB common cases — anything else writes 0 and the client auto-publish
 * will replace the contribution with the production-grader version next
 * time the owning teacher views her results. Matches the same shape
 * `gradeAnswer` returns: `{ pointsEarned: number }`.
 */
function naiveGrade(question, studentAnswer) {
  const maxPoints = typeof question.points === 'number' ? question.points : 1;
  if (
    studentAnswer === null ||
    studentAnswer === undefined ||
    studentAnswer === ''
  ) {
    return 0;
  }
  const type = question.type;
  if (type === 'MC' || type === 'TF') {
    return studentAnswer === question.correctAnswer ? maxPoints : 0;
  }
  if (type === 'FIB') {
    const normalize = (s) => String(s).trim().toLowerCase();
    if (normalize(studentAnswer) === normalize(question.correctAnswer)) {
      return maxPoints;
    }
    // Optional variants the production grader supports.
    const variants = Array.isArray(question.correctAnswerVariants)
      ? question.correctAnswerVariants
      : [];
    return variants.some((v) => normalize(v) === normalize(studentAnswer))
      ? maxPoints
      : 0;
  }
  // MA, Matching, Ordering — naive bootstrap returns 0; auto-publish from
  // QuizResults will overwrite with canonical grading.
  return 0;
}

function resolveStudentDisplayName(response) {
  // Migration doesn't have access to the per-teacher roster maps in this
  // script (those live client-side in the dashboard). Use what's on the
  // response: prefer recorded studentName if present, else the PIN
  // fallback, else a generic.
  if (typeof response.studentName === 'string' && response.studentName.trim()) {
    return response.studentName.trim();
  }
  if (typeof response.pin === 'string' && response.pin) {
    return `Student (PIN: ${response.pin})`;
  }
  return 'Student';
}

function buildContribution(args) {
  const { quizId, teacherUid, teacherName, syncGroupId, questions, responses } =
    args;
  const id = `${quizId}_${teacherUid}`;
  const maxPoints = questions.reduce(
    (sum, q) => sum + (typeof q.points === 'number' ? q.points : 1),
    0
  );
  const questionsSnapshot = questions.map((q) => ({
    id: q.id,
    text: q.text,
    points: typeof q.points === 'number' ? q.points : 1,
  }));
  const contributionResponses = responses.map((r) => {
    const answersByQ = new Map();
    for (const a of r.answers ?? []) {
      answersByQ.set(a.questionId, a.answer);
    }
    const pointsByQuestionId = {};
    let pointsEarned = 0;
    for (const q of questions) {
      if (!answersByQ.has(q.id)) continue;
      const ans = answersByQ.get(q.id);
      const points = naiveGrade(q, ans);
      pointsByQuestionId[q.id] = points;
      pointsEarned += points;
    }
    const status = r.status === 'completed' ? 'completed' : 'in-progress';
    const scorePercent =
      status === 'completed' && maxPoints > 0
        ? Math.round((pointsEarned / maxPoints) * 100)
        : null;
    return {
      studentDisplayName: resolveStudentDisplayName(r),
      pin: typeof r.pin === 'string' ? r.pin : null,
      classPeriod: typeof r.classPeriod === 'string' ? r.classPeriod : '',
      status,
      scorePercent,
      pointsEarned,
      maxPoints,
      tabSwitchWarnings:
        typeof r.tabSwitchWarnings === 'number' ? r.tabSwitchWarnings : 0,
      submittedAt:
        status === 'completed' && typeof r.submittedAt === 'number'
          ? r.submittedAt
          : null,
      pointsByQuestionId,
    };
  });
  return {
    id,
    schemaVersion: PLC_CONTRIBUTION_SCHEMA_VERSION,
    quizId,
    syncGroupId: syncGroupId ?? null,
    teacherUid,
    teacherName,
    questionsSnapshot,
    responses: contributionResponses,
    updatedAt: Date.now(),
  };
}

async function loadQuestions(db, assignment) {
  // Prefer synced quiz canonical questions — that's where modern PLC
  // quizzes keep their schema. Falls back to the member's local quiz
  // doc, but that field is often empty (questions live in Drive).
  const syncGroupId = assignment.sync?.groupId ?? null;
  if (syncGroupId) {
    const syncDoc = await db
      .collection('synced_quizzes')
      .doc(syncGroupId)
      .get();
    if (syncDoc.exists) {
      const data = syncDoc.data();
      if (Array.isArray(data.questions) && data.questions.length > 0) {
        return { questions: data.questions, source: 'synced' };
      }
    }
  }
  return { questions: [], source: 'unavailable', syncGroupId };
}

async function loadResponses(db, sessionId) {
  const snap = await db
    .collection('quiz_sessions')
    .doc(sessionId)
    .collection('responses')
    .get();
  return snap.docs.map((d) => d.data());
}

async function migrateAssignment(db, plcId, memberUid, assignment, report) {
  const assignmentId = assignment.id;
  const quizId = assignment.quizId;
  if (!quizId) {
    report.skipped.push({
      reason: 'missing-quizId',
      plcId,
      memberUid,
      assignmentId,
    });
    return;
  }
  const teacherName =
    typeof assignment.teacherName === 'string' && assignment.teacherName.trim()
      ? assignment.teacherName.trim()
      : 'Unknown Teacher';
  const { questions, source, syncGroupId } = await loadQuestions(
    db,
    assignment
  );
  if (questions.length === 0) {
    report.skipped.push({
      reason: 'no-questions-available',
      plcId,
      memberUid,
      assignmentId,
      quizId,
      questionSource: source,
    });
    return;
  }
  // The naive grader scores MA/Matching/Ordering as 0 (see naiveGrade above).
  // Surface this so the operator knows which assignments will have wrong
  // per-question stats until each teacher re-opens her Results screen
  // (which triggers auto-publish + canonical grader).
  const ungradeableTypes = new Set();
  for (const q of questions) {
    if (q.type === 'MA' || q.type === 'Matching' || q.type === 'Ordering') {
      ungradeableTypes.add(q.type);
    }
  }
  if (ungradeableTypes.size > 0) {
    report.partialGrading.push({
      plcId,
      memberUid,
      assignmentId,
      quizId,
      ungradeableTypes: Array.from(ungradeableTypes),
    });
  }
  const responses = await loadResponses(db, assignmentId);
  if (responses.length === 0) {
    report.skipped.push({
      reason: 'no-responses',
      plcId,
      memberUid,
      assignmentId,
      quizId,
    });
    return;
  }
  const contribution = buildContribution({
    quizId,
    teacherUid: memberUid,
    teacherName,
    syncGroupId: syncGroupId ?? assignment.sync?.groupId ?? null,
    questions,
    responses,
  });
  if (dryRun) {
    report.wouldWrite.push({
      plcId,
      memberUid,
      assignmentId,
      docId: contribution.id,
      responseCount: contribution.responses.length,
      questionCount: contribution.questionsSnapshot.length,
    });
    return;
  }
  await db
    .collection('plcs')
    .doc(plcId)
    .collection('contributions')
    .doc(contribution.id)
    .set(contribution);
  report.written.push({
    plcId,
    memberUid,
    assignmentId,
    docId: contribution.id,
    responseCount: contribution.responses.length,
  });
}

async function main() {
  const creds = loadCredentials();
  initializeApp({ credential: cert(creds) });
  const db = getFirestore();

  const report = {
    startedAt: new Date().toISOString(),
    dryRun,
    plcFilter,
    memberFilter,
    plcs: 0,
    members: 0,
    assignments: 0,
    written: [],
    wouldWrite: [],
    skipped: [],
    /**
     * Assignments containing MA / Matching / Ordering questions, which the
     * naive grader writes as 0. Listed here so the operator can decide
     * whether to wait for teachers to re-open their Results screens (the
     * auto-publish path will overwrite with the canonical grader) or to
     * follow up manually.
     */
    partialGrading: [],
    errors: [],
  };

  const plcsSnap = await db.collection('plcs').get();
  for (const plcDoc of plcsSnap.docs) {
    const plcId = plcDoc.id;
    if (plcFilter && plcId !== plcFilter) continue;
    const plc = plcDoc.data();
    report.plcs++;
    console.log(`\n=== PLC ${plcId} (${plc.name ?? 'unnamed'}) ===`);

    const memberUids = Array.isArray(plc.memberUids) ? plc.memberUids : [];
    for (const memberUid of memberUids) {
      if (memberFilter && memberUid !== memberFilter) continue;
      report.members++;

      try {
        const assignmentsSnap = await db
          .collection('users')
          .doc(memberUid)
          .collection('quiz_assignments')
          .where('plc.id', '==', plcId)
          .get();

        for (const assignmentDoc of assignmentsSnap.docs) {
          report.assignments++;
          const assignment = { id: assignmentDoc.id, ...assignmentDoc.data() };
          try {
            await migrateAssignment(db, plcId, memberUid, assignment, report);
          } catch (err) {
            report.errors.push({
              plcId,
              memberUid,
              assignmentId: assignment.id,
              error: err.message ?? String(err),
            });
            console.error(
              `  ✗ ${memberUid} / ${assignment.id}: ${err.message}`
            );
          }
        }
        const writtenForMember = report.written.filter(
          (w) => w.memberUid === memberUid && w.plcId === plcId
        ).length;
        const wouldForMember = report.wouldWrite.filter(
          (w) => w.memberUid === memberUid && w.plcId === plcId
        ).length;
        console.log(
          `  ${memberUid}: ${assignmentsSnap.size} assignments → ${dryRun ? wouldForMember + ' would write' : writtenForMember + ' written'}`
        );
      } catch (err) {
        report.errors.push({
          plcId,
          memberUid,
          error: err.message ?? String(err),
        });
        console.error(`  ✗ ${memberUid}: ${err.message}`);
      }
    }
  }

  report.finishedAt = new Date().toISOString();

  const outDir = join(__dirname, 'output');
  if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });
  const outPath = join(
    outDir,
    `plc-migration-${report.startedAt.replace(/[:.]/g, '-')}.json`
  );
  writeFileSync(outPath, JSON.stringify(report, null, 2));
  console.log(`\nReport: ${outPath}`);
  console.log(
    `Summary: ${report.plcs} PLCs, ${report.members} members visited, ${report.assignments} assignments touched, ${report.written.length} written, ${report.wouldWrite.length} would-write, ${report.skipped.length} skipped, ${report.errors.length} errors.`
  );
  if (report.partialGrading.length > 0) {
    console.warn(
      `\n⚠ ${report.partialGrading.length} assignment(s) contain MA/Matching/Ordering questions — the migration bootstrapped those at 0 points each. Teachers re-opening Results will overwrite with canonical grading via the auto-publish path. See report.partialGrading for the list.`
    );
  }
  // Exit non-zero on errors so CI / cron / `&&`-chained shell scripts
  // don't conclude "success" from a partially-failed migration. The
  // report file is still written, so the operator can diff and decide
  // whether to re-run with --plc=<id> to retry just the failed slice.
  if (report.errors.length > 0) {
    console.error(
      `\nFAILED: ${report.errors.length} error(s) — see report at ${outPath}.`
    );
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('FATAL:', err);
  process.exit(1);
});
