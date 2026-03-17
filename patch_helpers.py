import re

with open("utils/widgetHelpers.ts", "r") as f:
    content = f.read()

content = content.replace("""  if (widget.type === 'quiz') {
    const cfg = widget.config as QuizConfig;
    return cfg.selectedQuizTitle ? `Quiz: ${cfg.selectedQuizTitle}` : 'Quiz';
  }
  return widget.type.charAt(0).toUpperCase() + widget.type.slice(1);""", """  if (widget.type === 'quiz') {
    const cfg = widget.config as QuizConfig;
    return cfg.selectedQuizTitle ? `Quiz: ${cfg.selectedQuizTitle}` : 'Quiz';
  }
  if (widget.type === 'starter-pack') return 'Starter Pack';
  return widget.type.charAt(0).toUpperCase() + widget.type.slice(1);""")

content = content.replace("""export const getDefaultWidgetConfig = (type: WidgetType): WidgetConfig => {
  const config = WIDGET_DEFAULTS[type].config ?? {};
  return structuredClone(config);
};""", """export const getDefaultWidgetConfig = (type: WidgetType): WidgetConfig => {
  const config = WIDGET_DEFAULTS[type].config ?? {};
  return structuredClone(config);
};

export const createBoardSnapshot = (widgets: WidgetData[]): Omit<WidgetData, 'id'>[] => {
  return widgets.map((w) => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { id, ...rest } = w;
    return {
      ...rest,
      config: structuredClone(rest.config),
    };
  });
};""")

with open("utils/widgetHelpers.ts", "w") as f:
    f.write(content)
