with open("components/widgets/Breathing/BreathingWidget.test.tsx", "r") as f:
    content = f.read()

# Fix mockTime
content = content.replace("    let mockTime = 0;\n", "")

# Fix async without await
content = content.replace("it('starts breathing sequence when play is clicked', async () => {", "it('starts breathing sequence when play is clicked', () => {")

# Fix missing commas in config
config_str = """  config: {
    pattern: '4-4-4-4',
    visual: 'circle',
    color: '#3b82f6'
  }"""
config_str_fixed = """  config: {
    pattern: '4-4-4-4',
    visual: 'circle',
    color: '#3b82f6',
  },"""
content = content.replace(config_str, config_str_fixed)

with open("components/widgets/Breathing/BreathingWidget.test.tsx", "w") as f:
    f.write(content)
