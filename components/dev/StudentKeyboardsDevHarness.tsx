/** DEV-only harness for the quiz student keyboards at /student-keyboards-dev. */
import React, { useState } from 'react';
import { AccentKeysArea } from '@/components/student/keyboards/AccentKeys';
import { FibMultiBlankInput } from '@/components/quiz/FibMultiBlankInput';
import { WrittenResponseEditor } from '@/components/quiz/WrittenResponseEditor';

const MathAnswerField = React.lazy(
  () => import('@/components/student/keyboards/MathAnswerField')
);

const fibCls =
  'bg-white border-slate-300 text-slate-900 placeholder-slate-400 focus:border-brand-blue-light';

export const StudentKeyboardsDevHarness: React.FC = () => {
  const [single, setSingle] = useState('');
  const [multi, setMulti] = useState('');
  const [essay, setEssay] = useState(
    '<p>The slope is <span data-math="\\frac{3}{4}">3/4</span> so the line rises.</p>'
  );
  const [spanish, setSpanish] = useState('');
  const [spanishEssay, setSpanishEssay] = useState('');

  return (
    <div className="h-screen [height:100dvh] overflow-y-auto bg-slate-100 pb-24">
      <div className="max-w-2xl mx-auto p-4 space-y-6">
        <section
          className="bg-white rounded-xl border p-4 space-y-3"
          data-shot="fib"
        >
          <p className="font-bold">Solve for y when x = 2: y = 3x - 1</p>
          <React.Suspense fallback={null}>
            <MathAnswerField
              value={single}
              onChange={(p) => setSingle(p)}
              ariaLabel="Your answer"
              className={fibCls}
            />
          </React.Suspense>
          <p className="text-xs text-slate-500">
            Saved answer: {single || '(empty)'}
          </p>
        </section>
        <section
          className="bg-white rounded-xl border p-4 space-y-3"
          data-shot="multi"
        >
          <p className="font-bold">Fill in both blanks.</p>
          <FibMultiBlankInput
            count={2}
            value={multi}
            onChange={setMulti}
            onEnter={() => undefined}
            disabled={false}
            light
            inputClassName={fibCls}
            math
          />
        </section>
        <section
          className="bg-white rounded-xl border p-4 space-y-3"
          data-shot="essay"
        >
          <p className="font-bold">Explain how you found the slope.</p>
          <WrittenResponseEditor
            questionKey="essay"
            value={essay}
            onChange={setEssay}
            light
            mathEnabled
          />
          <pre className="text-xs whitespace-pre-wrap text-slate-500">
            {essay}
          </pre>
        </section>
        <section
          className="bg-white rounded-xl border p-4 space-y-3"
          data-shot="accents"
        >
          <p className="font-bold">{'¿Cómo se dice "song" en español?'}</p>
          <AccentKeysArea accents="es">
            <input
              type="text"
              value={spanish}
              onChange={(e) => setSpanish(e.target.value)}
              placeholder="Type your answer…"
              className={`w-full px-5 py-4 border-2 rounded-2xl text-sm ${fibCls}`}
            />
          </AccentKeysArea>
        </section>
        <section
          className="bg-white rounded-xl border p-4 space-y-3"
          data-shot="accents-essay"
        >
          <p className="font-bold">Describe tu fin de semana.</p>
          <AccentKeysArea accents="fr">
            <WrittenResponseEditor
              questionKey="fr"
              value={spanishEssay}
              onChange={setSpanishEssay}
              light
            />
          </AccentKeysArea>
        </section>
      </div>
    </div>
  );
};
