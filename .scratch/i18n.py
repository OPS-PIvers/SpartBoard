import json, collections

G = {
"en": {
 "label": "Translation",
 "editor": {
  "tab": "Languages",
  "pickLanguage": "Pick a language",
  "generate": "Generate translation",
  "reviewed": "Reviewed",
  "stale": "Stale",
  "regenerate_one": "Regenerate {{count}} stale question",
  "regenerate_other": "Regenerate {{count}} stale questions",
  "servedCount": "{{reviewed}} of {{total}} served in {{language}}",
  "save": "Save translation",
  "english": "English",
  "disabled": {
   "capReached": "Your school's monthly translation limit is used up.",
   "sourceNotEnglish": "Only quizzes written in English can be translated.",
   "bankSlots": "Quizzes that draw from question banks can't be translated."
  },
  "chromeNote": "App menus stay in English.",
  "empty": {
   "noLanguage": {"title": "No language chosen", "body": "Pick a language above to start a translation."},
   "noneReviewed": {"title": "Nothing reviewed yet", "body": "Students only ever see questions you mark reviewed. Ask an EL specialist to check them if you don't read this language."},
   "pickQuestion": {"title": "Pick a question", "body": "Choose a question on the left to see English and the translation side by side."}
  }
 },
 "authoring": {"advisory": {
  "stimulusText_one": "{{count}} image may contain text that stays in English.",
  "stimulusText_other": "{{count}} images may contain text that stays in English."
 }},
 "assign": {
  "generate": "Generate",
  "advisory": {
   "missing_one": "{{name}} needs {{language}}. That translation isn't ready - they'll see English.",
   "missing_other": "{{name}} and {{count}} others need translations that aren't ready ({{language}}) - they'll see English."
  }
 },
 "student": {"toggle": {"english": "English"}},
 "grading": {
  "backTranslate": "Translate this response",
  "backTranslationLabel": "English translation",
  "machineGenerated": "Machine-generated. The student's own words are the record."
 }
},
"de": {
 "label": "Übersetzung",
 "editor": {
  "tab": "Sprachen",
  "pickLanguage": "Sprache wählen",
  "generate": "Übersetzung erstellen",
  "reviewed": "Geprüft",
  "stale": "Veraltet",
  "regenerate_one": "{{count}} veraltete Frage neu übersetzen",
  "regenerate_other": "{{count}} veraltete Fragen neu übersetzen",
  "servedCount": "{{reviewed}} von {{total}} auf {{language}} freigegeben",
  "save": "Übersetzung speichern",
  "english": "Englisch",
  "disabled": {
   "capReached": "Das monatliche Übersetzungslimit deiner Schule ist aufgebraucht.",
   "sourceNotEnglish": "Nur Quiz auf Englisch können übersetzt werden.",
   "bankSlots": "Quiz mit Fragenpools können nicht übersetzt werden."
  },
  "chromeNote": "Menüs bleiben auf Englisch.",
  "empty": {
   "noLanguage": {"title": "Keine Sprache gewählt", "body": "Wähle oben eine Sprache, um eine Übersetzung zu starten."},
   "noneReviewed": {"title": "Noch nichts geprüft", "body": "Lernende sehen nur Fragen, die du als geprüft markierst. Bitte eine Sprachförderkraft um Unterstützung, wenn du diese Sprache nicht liest."},
   "pickQuestion": {"title": "Frage auswählen", "body": "Wähle links eine Frage, um Englisch und Übersetzung nebeneinander zu sehen."}
  }
 },
 "authoring": {"advisory": {
  "stimulusText_one": "{{count}} Bild enthält möglicherweise Text, der auf Englisch bleibt.",
  "stimulusText_other": "{{count}} Bilder enthalten möglicherweise Text, der auf Englisch bleibt."
 }},
 "assign": {
  "generate": "Erstellen",
  "advisory": {
   "missing_one": "{{name}} braucht {{language}}. Diese Übersetzung ist nicht bereit - Anzeige auf Englisch.",
   "missing_other": "{{name}} und {{count}} weitere brauchen Übersetzungen, die nicht bereit sind ({{language}}) - Anzeige auf Englisch."
  }
 },
 "student": {"toggle": {"english": "Englisch"}},
 "grading": {
  "backTranslate": "Diese Antwort übersetzen",
  "backTranslationLabel": "Englische Übersetzung",
  "machineGenerated": "Maschinell erstellt. Maßgeblich sind die eigenen Worte der Lernenden."
 }
},
"es": {
 "label": "Traducción",
 "editor": {
  "tab": "Idiomas",
  "pickLanguage": "Elige un idioma",
  "generate": "Generar traducción",
  "reviewed": "Revisada",
  "stale": "Desactualizada",
  "regenerate_one": "Regenerar {{count}} pregunta desactualizada",
  "regenerate_other": "Regenerar {{count}} preguntas desactualizadas",
  "servedCount": "{{reviewed}} de {{total}} disponibles en {{language}}",
  "save": "Guardar traducción",
  "english": "Inglés",
  "disabled": {
   "capReached": "Se agotó el límite mensual de traducción de tu centro.",
   "sourceNotEnglish": "Solo se pueden traducir los cuestionarios escritos en inglés.",
   "bankSlots": "Los cuestionarios que usan bancos de preguntas no se pueden traducir."
  },
  "chromeNote": "Los menús siguen en inglés.",
  "empty": {
   "noLanguage": {"title": "Ningún idioma elegido", "body": "Elige un idioma arriba para empezar una traducción."},
   "noneReviewed": {"title": "Nada revisado todavía", "body": "El alumnado solo ve las preguntas que marcas como revisadas. Pide ayuda a un especialista en idiomas si no lees este idioma."},
   "pickQuestion": {"title": "Elige una pregunta", "body": "Selecciona una pregunta a la izquierda para ver el inglés y la traducción lado a lado."}
  }
 },
 "authoring": {"advisory": {
  "stimulusText_one": "{{count}} imagen puede contener texto que se queda en inglés.",
  "stimulusText_other": "{{count}} imágenes pueden contener texto que se queda en inglés."
 }},
 "assign": {
  "generate": "Generar",
  "advisory": {
   "missing_one": "{{name}} necesita {{language}}. Esa traducción no está lista: verá el inglés.",
   "missing_other": "{{name}} y {{count}} más necesitan traducciones que no están listas ({{language}}): verán el inglés."
  }
 },
 "student": {"toggle": {"english": "Inglés"}},
 "grading": {
  "backTranslate": "Traducir esta respuesta",
  "backTranslationLabel": "Traducción al inglés",
  "machineGenerated": "Generada por una máquina. Las palabras del alumnado son el registro."
 }
},
"fr": {
 "label": "Traduction",
 "editor": {
  "tab": "Langues",
  "pickLanguage": "Choisir une langue",
  "generate": "Générer la traduction",
  "reviewed": "Vérifiée",
  "stale": "Obsolète",
  "regenerate_one": "Regénérer {{count}} question obsolète",
  "regenerate_other": "Regénérer {{count}} questions obsolètes",
  "servedCount": "{{reviewed}} sur {{total}} proposées en {{language}}",
  "save": "Enregistrer la traduction",
  "english": "Anglais",
  "disabled": {
   "capReached": "La limite mensuelle de traduction de votre établissement est atteinte.",
   "sourceNotEnglish": "Seuls les questionnaires rédigés en anglais peuvent être traduits.",
   "bankSlots": "Les questionnaires qui puisent dans des banques de questions ne peuvent pas être traduits."
  },
  "chromeNote": "Les menus restent en anglais.",
  "empty": {
   "noLanguage": {"title": "Aucune langue choisie", "body": "Choisissez une langue ci-dessus pour commencer une traduction."},
   "noneReviewed": {"title": "Rien de vérifié pour l'instant", "body": "Les élèves ne voient que les questions que vous marquez comme vérifiées. Demandez à un spécialiste des langues si vous ne lisez pas cette langue."},
   "pickQuestion": {"title": "Choisissez une question", "body": "Sélectionnez une question à gauche pour voir l'anglais et la traduction côte à côte."}
  }
 },
 "authoring": {"advisory": {
  "stimulusText_one": "{{count}} image peut contenir du texte qui reste en anglais.",
  "stimulusText_other": "{{count}} images peuvent contenir du texte qui reste en anglais."
 }},
 "assign": {
  "generate": "Générer",
  "advisory": {
   "missing_one": "{{name}} a besoin de {{language}}. Cette traduction n'est pas prête : l'anglais sera affiché.",
   "missing_other": "{{name}} et {{count}} autres ont besoin de traductions qui ne sont pas prêtes ({{language}}) : l'anglais sera affiché."
  }
 },
 "student": {"toggle": {"english": "Anglais"}},
 "grading": {
  "backTranslate": "Traduire cette réponse",
  "backTranslationLabel": "Traduction en anglais",
  "machineGenerated": "Générée par une machine. Les mots de l'élève font foi."
 }
}
}

for loc, group in G.items():
    p = 'locales/%s.json' % loc
    d = json.load(open(p), object_pairs_hook=collections.OrderedDict)
    out = collections.OrderedDict()
    for k, v in d.items():
        out[k] = v
        if k == 'quizReadAloud':
            out['quizTranslation'] = group
    if 'quizTranslation' not in out:
        out['quizTranslation'] = group
    with open(p, 'w') as f:
        json.dump(out, f, ensure_ascii=False, indent=2)
        f.write('\n')
print('ok')
