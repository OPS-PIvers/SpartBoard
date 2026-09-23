/**
 * The Common Cartridge reader. An LMS export is the one source that records
 * which choice is correct, so what these guard hardest is that the answer key
 * survives the trip — and that a question whose answer cannot be represented
 * comes in blank with a note rather than with a guess a student would be
 * marked wrong on.
 */

import { describe, it, expect } from 'vitest';
import JSZip from 'jszip';
import { readCartridge } from '@/utils/quizDocumentImport/cartridgeReader';
import { readQuizDocument } from '@/utils/quizDocumentImport';
import { DocumentTooLargeError } from '@/utils/quizDocumentImport/limits';

const MANIFEST = `<?xml version="1.0"?>
<manifest identifier="m1"><resources/></manifest>`;

const mcItem = (opts: { correct?: string; many?: boolean } = {}): string => `
  <item ident="i1" title="Q1">
    <itemmetadata><qtimetadata><qtimetadatafield>
      <fieldlabel>question_type</fieldlabel>
      <fieldentry>multiple_choice_question</fieldentry>
    </qtimetadatafield></qtimetadata></itemmetadata>
    <presentation>
      <material><mattext texttype="text/html">&lt;p&gt;What is the capital of France?&lt;/p&gt;</mattext></material>
      <response_lid ident="response1" rcardinality="Single">
        <render_choice>
          <response_label ident="a1"><material><mattext texttype="text/plain">Rome</mattext></material></response_label>
          <response_label ident="a2"><material><mattext texttype="text/plain">Paris</mattext></material></response_label>
          <response_label ident="a3"><material><mattext texttype="text/plain">Madrid</mattext></material></response_label>
        </render_choice>
      </response_lid>
    </presentation>
    <resprocessing>
      <outcomes><decvar maxvalue="100" minvalue="0" varname="SCORE" vartype="Decimal"/></outcomes>
      <respcondition continue="No">
        <conditionvar>
          <varequal respident="response1">${opts.correct ?? 'a2'}</varequal>
          ${opts.many ? '<varequal respident="response1">a3</varequal>' : ''}
        </conditionvar>
        <setvar action="Set" varname="SCORE">100</setvar>
      </respcondition>
    </resprocessing>
  </item>`;

const ESSAY_ITEM = `
  <item ident="i2" title="Q2">
    <itemmetadata><qtimetadata><qtimetadatafield>
      <fieldlabel>question_type</fieldlabel><fieldentry>essay_question</fieldentry>
    </qtimetadatafield></qtimetadata></itemmetadata>
    <presentation>
      <material><mattext texttype="text/html">Explain why.</mattext></material>
    </presentation>
  </item>`;

const FIB_ITEM = `
  <item ident="i3" title="Q3">
    <itemmetadata><qtimetadata><qtimetadatafield>
      <fieldlabel>question_type</fieldlabel><fieldentry>short_answer_question</fieldentry>
    </qtimetadatafield></qtimetadata></itemmetadata>
    <presentation>
      <material><mattext texttype="text/plain">The largest planet is ___.</mattext></material>
      <response_str ident="response1"><render_fib><response_label ident="answer1" rshuffle="No"/></render_fib></response_str>
    </presentation>
    <resprocessing>
      <outcomes><decvar/></outcomes>
      <respcondition continue="No">
        <conditionvar>
          <varequal respident="response1">Jupiter</varequal>
          <varequal respident="response1">jupiter</varequal>
        </conditionvar>
        <setvar action="Set" varname="SCORE">100</setvar>
      </respcondition>
    </resprocessing>
  </item>`;

const MATCHING_ITEM = `
  <item ident="i4" title="Q4">
    <itemmetadata><qtimetadata><qtimetadatafield>
      <fieldlabel>question_type</fieldlabel><fieldentry>matching_question</fieldentry>
    </qtimetadatafield></qtimetadata></itemmetadata>
    <presentation>
      <material><mattext texttype="text/plain">Match the country to its capital.</mattext></material>
      <response_lid ident="r1">
        <material><mattext texttype="text/plain">France</mattext></material>
        <render_choice>
          <response_label ident="c1"><material><mattext texttype="text/plain">Paris</mattext></material></response_label>
          <response_label ident="c2"><material><mattext texttype="text/plain">Rome</mattext></material></response_label>
        </render_choice>
      </response_lid>
      <response_lid ident="r2">
        <material><mattext texttype="text/plain">Italy</mattext></material>
        <render_choice>
          <response_label ident="c1"><material><mattext texttype="text/plain">Paris</mattext></material></response_label>
          <response_label ident="c2"><material><mattext texttype="text/plain">Rome</mattext></material></response_label>
        </render_choice>
      </response_lid>
    </presentation>
    <resprocessing>
      <outcomes><decvar/></outcomes>
      <respcondition><conditionvar><varequal respident="r1">c1</varequal></conditionvar><setvar varname="SCORE" action="Set">50</setvar></respcondition>
      <respcondition><conditionvar><varequal respident="r2">c2</varequal></conditionvar><setvar varname="SCORE" action="Set">50</setvar></respcondition>
    </resprocessing>
  </item>`;

const assessment = (title: string, items: string): string =>
  `<?xml version="1.0"?>
<questestinterop xmlns="http://www.imsglobal.org/xsd/ims_qtiasiv1p2">
  <assessment ident="a1" title="${title}"><section ident="root">${items}</section></assessment>
</questestinterop>`;

async function cartridge(
  files: Record<string, string | Uint8Array>,
  name = 'Unit 3 Test.imscc'
): Promise<File> {
  const zip = new JSZip();
  for (const [path, body] of Object.entries(files)) zip.file(path, body);
  const blob = await zip.generateAsync({ type: 'blob' });
  return new File([blob], name);
}

const oneQuiz = (items: string, title = 'Unit 3 Test') =>
  cartridge({
    [`imsmanifest.xml`]: MANIFEST,
    'quiz1/assessment_qti.xml': assessment(title, items),
  });

describe('readCartridge', () => {
  it('reads a multiple choice question and the answer the export marked', async () => {
    const quiz = await readCartridge(await oneQuiz(mcItem()), 'fallback');
    expect(quiz.title).toBe('Unit 3 Test');
    expect(quiz.questions).toHaveLength(1);
    const q = quiz.questions[0];
    expect(q.type).toBe('MC');
    expect(q.text).toBe('What is the capital of France?');
    expect(q.options.map((o) => `${o.letter}:${o.text}`)).toEqual([
      'A:Rome',
      'B:Paris',
      'C:Madrid',
    ]);
    expect(q.correctAnswer).toBe('Paris');
    expect(q.warnings).toEqual([]);
  });

  it('leaves the answer blank when the export marked more than one', async () => {
    const quiz = await readCartridge(
      await oneQuiz(mcItem({ many: true })),
      'fallback'
    );
    // Picking one would mark students wrong on the others.
    expect(quiz.questions[0].correctAnswer).toBe('');
    expect(quiz.questions[0].warnings.join(' ')).toMatch(
      /more than one correct answer/i
    );
  });

  it('says so when the marked answer is not one of the choices', async () => {
    const quiz = await readCartridge(
      await oneQuiz(mcItem({ correct: 'nope' })),
      'fallback'
    );
    expect(quiz.questions[0].correctAnswer).toBe('');
    expect(quiz.questions[0].warnings.join(' ')).toMatch(/does not offer/i);
  });

  it('brings an essay across as a written response with no key', async () => {
    const quiz = await readCartridge(await oneQuiz(ESSAY_ITEM), 'fallback');
    expect(quiz.questions[0].type).toBe('free-response');
    expect(quiz.questions[0].text).toBe('Explain why.');
  });

  it('keeps the first accepted answer of a fill-in and names the rest', async () => {
    const quiz = await readCartridge(await oneQuiz(FIB_ITEM), 'fallback');
    expect(quiz.questions[0].type).toBe('FIB');
    expect(quiz.questions[0].correctAnswer).toBe('Jupiter');
    expect(quiz.questions[0].warnings.join(' ')).toMatch(/accepted 2 answers/i);
  });

  it('rebuilds matching pairs from the per-prompt conditions', async () => {
    const quiz = await readCartridge(await oneQuiz(MATCHING_ITEM), 'fallback');
    const q = quiz.questions[0];
    expect(q.type).toBe('Matching');
    expect(q.text).toBe('Match the country to its capital.');
    // The prompt's own term must not swallow its choice list.
    expect(q.correctAnswer).toBe('France:Paris|Italy:Rome');
  });

  it('numbers questions in the order the export lists them', async () => {
    const quiz = await readCartridge(
      await oneQuiz(`${mcItem()}${ESSAY_ITEM}${FIB_ITEM}`),
      'fallback'
    );
    expect(quiz.questions.map((q) => q.number)).toEqual([1, 2, 3]);
  });

  it('takes the first test and says the export held more', async () => {
    const file = await cartridge({
      'imsmanifest.xml': MANIFEST,
      'quiz1/assessment_qti.xml': assessment('Unit 3 Test', mcItem()),
      'quiz2/assessment_qti.xml': assessment('Unit 4 Test', ESSAY_ITEM),
    });
    const quiz = await readCartridge(file, 'fallback');
    expect(quiz.warnings.join(' ')).toMatch(/holds 2 tests/i);
    expect(quiz.questions).toHaveLength(1);
  });

  it('falls back to the file name when the assessment has no title', async () => {
    const quiz = await readCartridge(
      await oneQuiz(mcItem(), ''),
      'Unit 3 Test'
    );
    expect(quiz.title).toBe('Unit 3 Test');
  });

  it('refuses a zip that is not a cartridge', async () => {
    const file = await cartridge({ 'notes.txt': 'hello' });
    await expect(readCartridge(file, 'x')).rejects.toThrow(/LMS export/i);
  });

  it('refuses a cartridge with no questions in it', async () => {
    const file = await cartridge({
      'imsmanifest.xml': MANIFEST,
      'course_settings/canvas_export.txt': 'nothing here',
    });
    await expect(readCartridge(file, 'x')).rejects.toThrow(/No questions/i);
  });

  it('stops unzipping once the export unpacks past the ceiling', async () => {
    const file = await oneQuiz(mcItem().repeat(50));
    await expect(readCartridge(file, 'x', 1024)).rejects.toThrow(
      DocumentTooLargeError
    );
  });
});

describe('readCartridge — pictures', () => {
  const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]);
  const imageItem = (src: string) => `
    <item ident="i9" title="Q">
      <presentation>
        <material><mattext texttype="text/html">&lt;p&gt;Name this shape. &lt;img src="${src}"/&gt;&lt;/p&gt;</mattext></material>
        <response_lid ident="response1"><render_choice>
          <response_label ident="a1"><material><mattext>Square</mattext></material></response_label>
        </render_choice></response_lid>
      </presentation>
    </item>`;

  it('lifts a picture the question points at out of the zip', async () => {
    const file = await cartridge({
      'imsmanifest.xml': MANIFEST,
      'quiz1/assessment_qti.xml': assessment(
        'T',
        imageItem('$IMS-CC-FILEBASE$/media/shape.png')
      ),
      'web_resources/media/shape.png': PNG,
    });
    const quiz = await readCartridge(file, 'x');
    expect(quiz.images).toHaveLength(1);
    expect(quiz.images[0].contentType).toBe('image/png');
    expect(quiz.questions[0].imageIds).toEqual([quiz.images[0].id]);
    // The `<img>` must not leave its markup in the stem.
    expect(quiz.questions[0].text).toBe('Name this shape.');
  });

  it('does not throw the import away over an undecodable picture path', async () => {
    const file = await cartridge({
      'imsmanifest.xml': MANIFEST,
      // A stray `%` makes decodeURIComponent throw; the read must survive it.
      'quiz1/assessment_qti.xml': assessment(
        'T',
        imageItem('media/100%25 scale%.png')
      ),
    });
    const quiz = await readCartridge(file, 'x');
    expect(quiz.questions).toHaveLength(1);
    expect(quiz.questions[0].imageIds).toEqual([]);
    expect(quiz.questions[0].warnings.join(' ')).toMatch(
      /A picture could not/i
    );
  });

  it('still finds a picture whose path is percent-encoded', async () => {
    const file = await cartridge({
      'imsmanifest.xml': MANIFEST,
      'quiz1/assessment_qti.xml': assessment(
        'T',
        imageItem('$IMS-CC-FILEBASE$/media/unit%203.png')
      ),
      'web_resources/media/unit 3.png': PNG,
    });
    const quiz = await readCartridge(file, 'x');
    expect(quiz.images).toHaveLength(1);
    expect(quiz.questions[0].imageIds).toEqual([quiz.images[0].id]);
  });

  it('says so when a picture is referenced but not in the zip', async () => {
    const file = await cartridge({
      'imsmanifest.xml': MANIFEST,
      'quiz1/assessment_qti.xml': assessment('T', imageItem('media/gone.png')),
    });
    const quiz = await readCartridge(file, 'x');
    expect(quiz.images).toEqual([]);
    expect(quiz.questions[0].imageIds).toEqual([]);
    expect(quiz.questions[0].warnings.join(' ')).toMatch(
      /A picture could not/i
    );
  });
});

/**
 * Schoology writes no `question_type` at all: a Common Cartridge states the
 * type as a `cc_profile`. These items are shaped after a real export.
 */
describe('readCartridge — a cc_profile instead of question_type', () => {
  const ccItem = (profile: string, body: string): string => `
    <item ident="9">
      <itemmetadata><qtimetadata><qtimetadatafield>
        <fieldlabel>cc_profile</fieldlabel><fieldentry>${profile}</fieldentry>
      </qtimetadatafield></qtimetadata></itemmetadata>
      ${body}
    </item>`;

  it('reads a true/false question and its answer', async () => {
    const item = ccItem(
      'cc.true_false.v0p1',
      `<presentation>
         <material><mattext texttype="text/html">A 89.5% rounds up to an A.</mattext></material>
         <response_lid ident="10" rcardinality="Single"><render_choice>
           <response_label ident="33"><material><mattext texttype="text/html">True</mattext></material></response_label>
           <response_label ident="34"><material><mattext texttype="text/html">False</mattext></material></response_label>
         </render_choice></response_lid>
       </presentation>
       <resprocessing>
         <outcomes><decvar maxvalue="100" minvalue="0" varname="SCORE" vartype="Decimal"/></outcomes>
         <respcondition continue="No">
           <conditionvar><varequal respident="10">34</varequal></conditionvar>
           <setvar action="Set" varname="SCORE">100</setvar>
         </respcondition>
       </resprocessing>`
    );
    const quiz = await readCartridge(await oneQuiz(item), 'fallback');
    expect(quiz.questions[0].type).toBe('MC');
    expect(quiz.questions[0].correctAnswer).toBe('False');
  });

  it('reads a fill-in question, which has no choice list to infer from', async () => {
    const item = ccItem(
      'cc.fib.v0p1',
      `<presentation>
         <material><mattext texttype="text/plain">The largest planet is ___.</mattext></material>
         <response_str ident="r1"><render_fib><response_label ident="a1"/></render_fib></response_str>
       </presentation>
       <resprocessing>
         <outcomes><decvar/></outcomes>
         <respcondition continue="No">
           <conditionvar><varequal respident="r1">Jupiter</varequal></conditionvar>
           <setvar action="Set" varname="SCORE">100</setvar>
         </respcondition>
       </resprocessing>`
    );
    const quiz = await readCartridge(await oneQuiz(item), 'fallback');
    expect(quiz.questions[0].type).toBe('FIB');
    expect(quiz.questions[0].correctAnswer).toBe('Jupiter');
  });

  it('reads a pattern-match question as fill-in', async () => {
    const item = ccItem(
      'cc.pattern_match.v0p1',
      `<presentation>
         <material><mattext texttype="text/plain">Spell the capital of France.</mattext></material>
         <response_str ident="r1"><render_fib><response_label ident="a1"/></render_fib></response_str>
       </presentation>
       <resprocessing>
         <outcomes><decvar/></outcomes>
         <respcondition continue="No">
           <conditionvar><varequal respident="r1">Paris</varequal></conditionvar>
           <setvar action="Set" varname="SCORE">100</setvar>
         </respcondition>
       </resprocessing>`
    );
    const quiz = await readCartridge(await oneQuiz(item), 'fallback');
    expect(quiz.questions[0].type).toBe('FIB');
  });

  it('reads an essay question as free response', async () => {
    const item = ccItem(
      'cc.essay.v0p1',
      `<presentation>
         <material><mattext texttype="text/html">Explain why.</mattext></material>
       </presentation>`
    );
    const quiz = await readCartridge(await oneQuiz(item), 'fallback');
    expect(quiz.questions[0].type).toBe('free-response');
  });

  it('leaves a select-all question blank, whose answers sit inside an <and>', async () => {
    const item = ccItem(
      'cc.multiple_response.v0p1',
      `<presentation>
         <material><mattext texttype="text/html">Choose all that apply.</mattext></material>
         <response_lid ident="15" rcardinality="Multiple"><render_choice>
           <response_label ident="47"><material><mattext texttype="text/html">One</mattext></material></response_label>
           <response_label ident="48"><material><mattext texttype="text/html">Two</mattext></material></response_label>
           <response_label ident="49"><material><mattext texttype="text/html">Three</mattext></material></response_label>
         </render_choice></response_lid>
       </presentation>
       <resprocessing>
         <outcomes><decvar maxvalue="100" minvalue="0" varname="SCORE" vartype="Decimal"/></outcomes>
         <respcondition continue="No">
           <conditionvar><and>
             <varequal respident="15">48</varequal>
             <varequal respident="15">49</varequal>
           </and></conditionvar>
           <setvar action="Set" varname="SCORE">100</setvar>
         </respcondition>
       </resprocessing>`
    );
    const quiz = await readCartridge(await oneQuiz(item), 'fallback');
    expect(quiz.questions[0].type).toBe('MC');
    expect(quiz.questions[0].options).toHaveLength(3);
    expect(quiz.questions[0].correctAnswer).toBe('');
    expect(quiz.questions[0].warnings.join(' ')).toMatch(
      /more than one correct answer/i
    );
  });

  it('still prefers question_type when an export writes both', async () => {
    const item = `
      <item ident="9">
        <itemmetadata><qtimetadata>
          <qtimetadatafield><fieldlabel>question_type</fieldlabel><fieldentry>essay_question</fieldentry></qtimetadatafield>
          <qtimetadatafield><fieldlabel>cc_profile</fieldlabel><fieldentry>cc.multiple_choice.v0p1</fieldentry></qtimetadatafield>
        </qtimetadata></itemmetadata>
        <presentation>
          <material><mattext texttype="text/plain">Explain why.</mattext></material>
        </presentation>
      </item>`;
    const quiz = await readCartridge(await oneQuiz(item), 'fallback');
    expect(quiz.questions[0].type).toBe('free-response');
  });
});

describe('readQuizDocument — .imscc', () => {
  it('routes an .imscc to the cartridge reader', async () => {
    const quiz = await readQuizDocument(await oneQuiz(mcItem()));
    expect(quiz.questions[0].correctAnswer).toBe('Paris');
  });
});
