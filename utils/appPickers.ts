import { closeSelectMenu } from './selectMenu';
import { closeDatePicker } from './datePicker';
import { closeSuggestions } from './suggestionList';
import { setAppPickersEnabled } from './pickerPanel';

/** Turns the app's own pickers on or off; turning off closes any that are open. */
export const switchAppPickers = (on: boolean) => {
  setAppPickersEnabled(on);
  if (on) return;
  closeSelectMenu();
  closeDatePicker();
  closeSuggestions();
};
