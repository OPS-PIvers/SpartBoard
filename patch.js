import fs from 'fs';
let content = fs.readFileSync('utils/ai.ts', 'utf8');

const target = `  } catch (error) {
    console.error('Guided Learning Generation Error:', error);
    if (error instanceof Error) throw error;
    if (error instanceof Error) {
      if (
        error.message.includes('Invalid response format from AI') ||
        error.message.includes('AI returned no valid guided learning steps')
      ) {
        throw error;
      }
    }
    throw new Error(
      'Failed to generate guided learning experience. Please try again.'
    );
  }`;

const replacement = `  } catch (error) {
    console.error('Guided Learning Generation Error:', error);
    if (error instanceof Error) {
      if (
        error.message.includes('Invalid response format from AI') ||
        error.message.includes('AI returned no valid guided learning steps')
      ) {
        throw error;
      }
    }
    throw new Error(
      'Failed to generate guided learning experience. Please try again.',
      { cause: error }
    );
  }`;

content = content.replace(target, replacement);
fs.writeFileSync('utils/ai.ts', content);
