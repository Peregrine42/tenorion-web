const fs = require("fs");
const MidiWriter = require("midi-writer-js");

for (let octave = 0; octave <= 8; octave++) {
  for (const note of [
    "C",
    "C#",
    "D",
    "D#",
    "E",
    "F",
    "F#",
    "G",
    "G#",
    "A",
    "A#",
    "B",
  ]) {
    const track = new MidiWriter.Track();
    track.addEvent(new MidiWriter.ProgramChangeEvent({ instrument: 0 }));
    track.addEvent(
      new MidiWriter.NoteEvent({
        pitch: [`${note}${octave}`],
        duration: "1",
        velocity: 127,
      })
    );
    fs.writeFileSync(
      `midi/${note}${octave}.mid`,
      new MidiWriter.Writer(track).buildFile()
    );
  }
}
