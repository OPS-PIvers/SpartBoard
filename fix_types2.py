import re

with open("types.ts", "r") as f:
    content = f.read()

# Fix the broken ConfigForWidget mapping
bad_mapping = """                                                                                  : T extends 'specialist-schedule'
                                                                                    : T extends 'graphic-organizer'
                                                                                      ? GraphicOrganizerConfig
                                                                                    ? SpecialistScheduleConfig
                                                                                    : never;"""

good_mapping = """                                                                                  : T extends 'specialist-schedule'
                                                                                    ? SpecialistScheduleConfig
                                                                                    : T extends 'graphic-organizer'
                                                                                      ? GraphicOrganizerConfig
                                                                                      : never;"""

content = content.replace(bad_mapping, good_mapping)

with open("types.ts", "w") as f:
    f.write(content)
