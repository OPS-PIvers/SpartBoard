p = 'components/quiz/QuizStudentApp.tsx'
s = open(p).read()

def sub(old, new, count=1):
    global s
    assert old in s, 'NOT FOUND: ' + old[:120]
    s = s.replace(old, new, count)

sub("""import {
  serveQuestionSubset,
  applyHiddenOptions,
  applyTimeMultiplier,
} from '@/utils/quizOverrideServing';""",
    """import {
  serveQuestionSubset,
  applyHiddenOptions,
  applyTimeMultiplier,
  serveLocalizedQuestion,
} from '@/utils/quizOverrideServing';
import { applyLocalizedStrings } from '@/utils/quizLocalizedDisplay';
import { languageNativeLabel } from '@/utils/languageNativeLabel';""")

# MC options render from the display question; conversion still keys off currentQuestion.
sub("""  const options =
    currentQuestion.type === 'MC' ? (currentQuestion.choices ?? []) : [];""",
    """  const options =
    displayQuestion?.type === 'MC' ? (displayQuestion.choices ?? []) : [];""")

# Question stem, both read-aloud and plain branches.
sub("""                {currentQuestion.text}
              </h2>
              <ReadAloudButton""",
    """                {displayQuestion.text}
              </h2>
              <ReadAloudButton""")
sub("""              {currentQuestion.text}
            </h2>""",
    """              {displayQuestion.text}
            </h2>""")

# Structured inputs render the localized arrays and remount on a locale change.
sub("""              <StructuredQuestionInput
                key={currentQuestion.id}
                question={currentQuestion}""",
    """              <StructuredQuestionInput
                key={`${currentQuestion.id}:${activeLocale ?? 'en'}`}
                question={displayQuestion}""")

# Free-response rubric + placeholder.
sub("""              {currentQuestion.rubricSnapshot && (
                <CollapsibleRubric
                  rubric={currentQuestion.rubricSnapshot}""",
    """              {displayQuestion.rubricSnapshot && (
                <CollapsibleRubric
                  rubric={displayQuestion.rubricSnapshot}""")
sub("""                  placeholder={currentQuestion.placeholder}""",
    """                  placeholder={displayQuestion.placeholder}""")

open(p, 'w').write(s)
print('display swaps applied')
