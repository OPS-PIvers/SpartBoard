const fs = require('fs');
let widget = fs.readFileSync('components/widgets/SoundboardWidget/Widget.tsx', 'utf8');

// I replaced visibleSounds useMemo earlier but looks like it didn't take because of whitespace mismatch
widget = widget.replace(/const visibleSounds = useMemo\(\(\) => \{[\s\S]*?\}, \[globalConfig, buildingId, selectedSoundIds\]\);/m,
`const visibleSounds = useMemo(() => {
    let availableSounds: SoundboardSound[] = [];

    if (!buildingId) {
      // If no building selected, aggregate all available sounds from all building defaults
      const allDefaults = globalConfig?.buildingDefaults || {};
      availableSounds = Object.values(allDefaults).flatMap(d => d.availableSounds || []);
    } else {
      availableSounds = globalConfig?.buildingDefaults?.[buildingId]?.availableSounds ?? [];
    }

    return availableSounds.filter(
      (sound) =>
        selectedSoundIds.includes(sound.id) &&
        typeof sound.url === 'string' &&
        sound.url.trim() !== ''
    );
  }, [globalConfig, buildingId, selectedSoundIds]);`);

fs.writeFileSync('components/widgets/SoundboardWidget/Widget.tsx', widget);
