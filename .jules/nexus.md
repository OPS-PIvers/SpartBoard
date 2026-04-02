## 2024-04-02 - [Randomizer Data Integration]

Source: Classes Widget
Destination: Randomizer Widget
Value: The user's roster data is not efficiently loaded into the Randomizer when configured using custom settings. We can add a "Import from active roster" option in Randomizer Settings if `rosterMode === 'custom'`. Oh wait, Randomizer ALREADY SUPPORTS `rosterMode === 'class'`. Let me look closer at `RandomSettings.tsx`.

## 2024-04-02 - [Text to Concept Web]

Source: TextWidget
Destination: ConceptWeb
Value: Allows a user to rapidly generate a Concept Web (mind map) from text they've pasted or written in a Text widget. They can list ideas line-by-line in the Text Widget and instantly turn them into interactive, movable nodes in the Concept Web.
