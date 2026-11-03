# Connections live on the board, and a Run belongs to one device

Connections (Sequences and Follows between widgets) are stored as one list on the board that names widgets by id, not as per-widget config toggles that find "the first widget of type X". This reverses Decision A in `docs/specs/LO12-nexus-widget-connections-spec.md`, which kept per-widget fields because no candidate needed two widgets of one type. Teachers do: two timers (Shareout and Transition) in one loop is the founding case, and an ordered, loopable, editable Sequence can't be expressed as scattered toggles.

Each Run is carried out only by the device it started on; other open copies of the board display it, and one takes over only when a step is overdue. Without that, every open copy fires every step (today a timer ending picks a name once per open tab).

## Consequences

- The legacy toggles (`timerEnd*`, `autoStartTimer`, `autoTrafficLight`, `syncWithTimeTool`, `syncWithTextWidget`, `syncExpectations`, `linkedWeatherWidgetId`) are converted into Connections and removed once the flag is public.
- Board duplicate, share and import keep widget ids, so Connections copy with the board; duplicating a single widget does not join the copy to any Connection.
- A closed widget's Steps and Follows are skipped wherever Connections are read, not deleted, so undoing the close brings them back; the next save from the step editor drops the stale ids.
