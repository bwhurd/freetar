/* tslint:disable */
/* eslint-disable */
/**
* The chord modifiers.
*/
export enum KordModifier {
/**
* Minor modifier.
*/
  Minor = 0,
/**
* Flat 5 modifier.
*/
  Flat5 = 1,
/**
* Sharp 5 modifier.
*/
  Augmented5 = 2,
/**
* Major 7 modifier.
*/
  Major7 = 3,
/**
* Dominant 7 modifier.
*/
  Dominant7 = 4,
/**
* Dominant 9 modifier.
*/
  Dominant9 = 5,
/**
* Dominant 11 modifier.
*/
  Dominant11 = 6,
/**
* Dominant 13 modifier.
*/
  Dominant13 = 7,
/**
* Flat 9 modifier.
*/
  Flat9 = 8,
/**
* Sharp 9 modifier.
*/
  Sharp9 = 9,
/**
* Sharp 11 modifier.
*/
  Sharp11 = 10,
/**
* Diminished modifier.
*/
  Diminished = 11,
}
/**
* An enum representing the interval between two notes.
*/
export enum KordInterval {
/**
* A perfect unison interval.
*/
  PerfectUnison = 0,
/**
* A diminished second interval.
*/
  DiminishedSecond = 1,
/**
* An augmented unison interval.
*/
  AugmentedUnison = 2,
/**
* A minor second interval.
*/
  MinorSecond = 3,
/**
* A major second interval.
*/
  MajorSecond = 4,
/**
* A diminished third interval.
*/
  DiminishedThird = 5,
/**
* An augmented second interval.
*/
  AugmentedSecond = 6,
/**
* A minor third interval.
*/
  MinorThird = 7,
/**
* A major third interval.
*/
  MajorThird = 8,
/**
* A diminished fourth interval.
*/
  DiminishedFourth = 9,
/**
* An augmented third interval.
*/
  AugmentedThird = 10,
/**
* A perfect fourth interval.
*/
  PerfectFourth = 11,
/**
* An augmented fourth interval.
*/
  AugmentedFourth = 12,
/**
* A diminished fifth interval.
*/
  DiminishedFifth = 13,
/**
* A perfect fifth interval.
*/
  PerfectFifth = 14,
/**
* A diminished sixth interval.
*/
  DiminishedSixth = 15,
/**
* An augmented fifth interval.
*/
  AugmentedFifth = 16,
/**
* A minor sixth interval.
*/
  MinorSixth = 17,
/**
* A major sixth interval.
*/
  MajorSixth = 18,
/**
* A diminished seventh interval.
*/
  DiminishedSeventh = 19,
/**
* An augmented sixth interval.
*/
  AugmentedSixth = 20,
/**
* A minor seventh interval.
*/
  MinorSeventh = 21,
/**
* A major seventh interval.
*/
  MajorSeventh = 22,
/**
* A diminished octave interval.
*/
  DiminishedOctave = 23,
/**
* An augmented seventh interval.
*/
  AugmentedSeventh = 24,
/**
* A perfect octave interval.
*/
  PerfectOctave = 25,
/**
* An minor ninth interval.
*/
  MinorNinth = 26,
/**
* A major ninth interval.
*/
  MajorNinth = 27,
/**
* An augmented ninth interval.
*/
  AugmentedNinth = 28,
/**
* A diminished eleventh interval.
*/
  DiminishedEleventh = 29,
/**
* A perfect eleventh interval.
*/
  PerfectEleventh = 30,
/**
* An augmented eleventh interval.
*/
  AugmentedEleventh = 31,
/**
* A minor thirteenth interval.
*/
  MinorThirteenth = 32,
/**
* A major thirteenth interval.
*/
  MajorThirteenth = 33,
/**
* An augmented thirteenth interval.
*/
  AugmentedThirteenth = 34,
/**
* A perfect octave and perfect fifth interval.
*/
  PerfectOctaveAndPerfectFifth = 35,
/**
* Two perfect octaves.
*/
  TwoPerfectOctaves = 36,
/**
* Two perfect octaves and a major third.
*/
  TwoPerfectOctavesAndMajorThird = 37,
/**
* Two perfect octaves and a perfect fifth.
*/
  TwoPerfectOctavesAndPerfectFifth = 38,
/**
* Two perfect octaves and a minor sixth.
*/
  TwoPerfectOctavesAndMinorSeventh = 39,
/**
* Three perfect octaves.
*/
  ThreePerfectOctaves = 40,
/**
* Three perfect octaves and a major second.
*/
  ThreePerfectOctavesAndMajorSecond = 41,
/**
* Three perfect octaves and a major third.
*/
  ThreePerfectOctavesAndMajorThird = 42,
/**
* Three perfect octaves and an augmented fourth.
*/
  ThreePerfectOctavesAndAugmentedFourth = 43,
/**
* Three perfect octaves and a perfect fifth.
*/
  ThreePerfectOctavesAndPerfectFifth = 44,
/**
* Three perfect octaves and a minor sixth.
*/
  ThreePerfectOctavesAndMinorSixth = 45,
/**
* Three perfect octaves and a minor seventh.
*/
  ThreePerfectOctavesAndMinorSeventh = 46,
/**
* Three perfect octaves and a major seventh.
*/
  ThreePerfectOctavesAndMajorSeventh = 47,
}
/**
* An enum representing the extension of a chord.
*
* Extensions are not really "special" in the sense that they do not change how the
* chord is interpreted by the system.  E.g., an `add2` just adds a 2 to the chord,
* and the chord is still interpreted as a major chord.
*/
export enum KordExtension {
/**
* Sus2 extension.
*/
  Sus2 = 0,
/**
* Sus4 extension.
*/
  Sus4 = 1,
/**
* Flat 11 extension.
*/
  Flat11 = 2,
/**
* Flat 13 extension.
*/
  Flat13 = 3,
/**
* Sharp 13 extension.
*/
  Sharp13 = 4,
/**
* Add2 extension.
*/
  Add2 = 5,
/**
* Add4 extension.
*/
  Add4 = 6,
/**
* Add6 extension.
*/
  Add6 = 7,
/**
* Add9 extension.
*/
  Add9 = 8,
/**
* Add11 extension.
*/
  Add11 = 9,
/**
* Add13 extension.
*/
  Add13 = 10,
}
/**
* The [`Chord`] wrapper.
*/
export class KordChord {
  free(): void;
/**
* Creates a new [`Chord`] from a frequency.
* @param {string} name
* @returns {KordChord}
*/
  static parse(name: string): KordChord;
/**
* Creates a new [`Chord`] from a set of [`Note`]s.
*
* The [`Note`]s should be represented as a space-separated string.
* E.g., `C E G`.
* @param {string} notes
* @returns {Array<any>}
*/
  static fromNotesString(notes: string): Array<any>;
/**
* Creates a new [`Chord`] from a set of [`Note`]s.
* @param {Array<any>} notes
* @returns {Array<any>}
*/
  static fromNotes(notes: Array<any>): Array<any>;
/**
* Returns the [`Chord`]'s friendly name.
* @returns {string}
*/
  name(): string;
/**
* Returns the [`Chord`]'s precise name.
* @returns {string}
*/
  preciseName(): string;
/**
* Returns the [`Chord`] as a string (same as `precise_name`).
* @returns {string}
*/
  toString(): string;
/**
* Returns the [`Chord`]'s description.
* @returns {string}
*/
  description(): string;
/**
* Returns the [`Chord`]'s display text.
* @returns {string}
*/
  display(): string;
/**
* Returns the [`Chord`]'s root note.
* @returns {string}
*/
  root(): string;
/**
* Returns the [`Chord`]'s slash note.
* @returns {string}
*/
  slash(): string;
/**
* Returns the [`Chord`]'s inversion.
* @returns {number}
*/
  inversion(): number;
/**
* Returns whether or not the [`Chord`] is "crunchy".
* @returns {boolean}
*/
  isCrunchy(): boolean;
/**
* Returns the [`Chord`]'s chord tones.
* @returns {Array<any>}
*/
  chord(): Array<any>;
/**
* Returns the [`Chord`]'s chord tones as a string.
* @returns {string}
*/
  chordString(): string;
/**
* Returns the [`Chord`]'s scale tones.
* @returns {Array<any>}
*/
  scale(): Array<any>;
/**
* Returns the [`Chord`]'s scale tones as a string.
* @returns {string}
*/
  scaleString(): string;
/**
* Returns the [`Chord`]'s modifiers.
* @returns {Array<any>}
*/
  modifiers(): Array<any>;
/**
* Returns the [`Chord`]'s extensions.
* @returns {Array<any>}
*/
  extensions(): Array<any>;
/**
* Returns a new [`Chord`] with the inversion set to the provided value.
* @param {number} inversion
* @returns {KordChord}
*/
  withInversion(inversion: number): KordChord;
/**
* Returns a new [`Chord`] with the slash set to the provided value.
* @param {KordNote} slash
* @returns {KordChord}
*/
  withSlash(slash: KordNote): KordChord;
/**
* Returns a new [`Chord`] with the octave of the root set to the provided value.
* @param {number} octave
* @returns {KordChord}
*/
  withOctave(octave: number): KordChord;
/**
* Returns a new [`Chord`] with the "crunchiness" set to the provided value.
* @param {boolean} is_crunchy
* @returns {KordChord}
*/
  withCrunchy(is_crunchy: boolean): KordChord;
/**
* Plays the [`Chord`].
* @param {number} delay
* @param {number} length
* @param {number} fade_in
* @returns {Promise<void>}
*/
  play(delay: number, length: number, fade_in: number): Promise<void>;
/**
* Returns the clone of the [`Chord`].
* @returns {KordChord}
*/
  copy(): KordChord;
/**
* Returns a new [`Chord`] with the `minor` modifier.
* @returns {KordChord}
*/
  minor(): KordChord;
/**
* Returns a new [`Chord`] with the `flat5` modifier.
* @returns {KordChord}
*/
  flat5(): KordChord;
/**
* Returns a new [`Chord`] with the `augmented` modifier.
* @returns {KordChord}
*/
  aug(): KordChord;
/**
* Returns a new [`Chord`] with the `maj7` modifier.
* @returns {KordChord}
*/
  maj7(): KordChord;
/**
* Returns a new [`Chord`] with the `dom7` modifier.
* @returns {KordChord}
*/
  seven(): KordChord;
/**
* Returns a new [`Chord`] with the `dom9` modifier.
* @returns {KordChord}
*/
  nine(): KordChord;
/**
* Returns a new [`Chord`] with the `dom11` modifier.
* @returns {KordChord}
*/
  eleven(): KordChord;
/**
* Returns a new [`Chord`] with the `dom13` modifier.
* @returns {KordChord}
*/
  thirteen(): KordChord;
/**
* Returns a new [`Chord`] with the `flat9` modifier.
* @returns {KordChord}
*/
  flat9(): KordChord;
/**
* Returns a new [`Chord`] with the `sharp9` modifier.
* @returns {KordChord}
*/
  sharp9(): KordChord;
/**
* Returns a new [`Chord`] with the `sharp11` modifier.
* @returns {KordChord}
*/
  sharp11(): KordChord;
/**
* Returns a new [`Chord`] with the `dim` modifier.
* @returns {KordChord}
*/
  dim(): KordChord;
/**
* Returns a new [`Chord`] with the `halfDim` modifier.
* @returns {KordChord}
*/
  halfDim(): KordChord;
/**
* Returns a new [`Chord`] with the `sus2` extension.
* @returns {KordChord}
*/
  sus2(): KordChord;
/**
* Returns a new [`Chord`] with the `sus4` extension.
* @returns {KordChord}
*/
  sus4(): KordChord;
/**
* Returns a new [`Chord`] with the `flat11` extension.
* @returns {KordChord}
*/
  flat11(): KordChord;
/**
* Returns a new [`Chord`] with the `flat13` extension.
* @returns {KordChord}
*/
  flat13(): KordChord;
/**
* Returns a new [`Chord`] with the `sharp13` extension.
* @returns {KordChord}
*/
  sharp13(): KordChord;
/**
* Returns a new [`Chord`] with the `add2` extension.
* @returns {KordChord}
*/
  add2(): KordChord;
/**
* Returns a new [`Chord`] with the `add4` extension.
* @returns {KordChord}
*/
  add4(): KordChord;
/**
* Returns a new [`Chord`] with the `add6` extension.
* @returns {KordChord}
*/
  add6(): KordChord;
/**
* Returns a new [`Chord`] with the `add9` extension.
* @returns {KordChord}
*/
  add9(): KordChord;
/**
* Returns a new [`Chord`] with the `add11` extension.
* @returns {KordChord}
*/
  add11(): KordChord;
/**
* Returns a new [`Chord`] with the `add13` extension.
* @returns {KordChord}
*/
  add13(): KordChord;
}
/**
* The [`Note`] wrapper.
*/
export class KordNote {
  free(): void;
/**
* Creates a new [`Note`] from a frequency.
* @param {string} name
* @returns {KordNote}
*/
  static parse(name: string): KordNote;
/**
* Returns [`Note`]s from audio data.
* @param {Float32Array} data
* @param {number} length_in_seconds
* @returns {Array<any>}
*/
  static fromAudio(data: Float32Array, length_in_seconds: number): Array<any>;
/**
* Returns [`Note`]s from audio data using the ML inference algorithm.
* @param {Float32Array} data
* @param {number} length_in_seconds
* @returns {Array<any>}
*/
  static fromAudioMl(data: Float32Array, length_in_seconds: number): Array<any>;
/**
* Returns the [`Note`]'s friendly name.
* @returns {string}
*/
  name(): string;
/**
* Returns the [`Note`] represented as a string (same as `name`).
* @returns {string}
*/
  toString(): string;
/**
* Returns the [`Note`]'s [`NamedPitch`].
* @returns {string}
*/
  pitch(): string;
/**
* Returns the [`Note`]'s [`Octave`].
* @returns {number}
*/
  octave(): number;
/**
* Returns the [`Note`]'s frequency.
* @returns {number}
*/
  frequency(): number;
/**
* Adds the given interval to the [`Note`], producing a new [`Note`] instance.
* @param {KordInterval} interval
* @returns {KordNote}
*/
  addInterval(interval: KordInterval): KordNote;
/**
* Subtracts the given interval from the [`Note`], producing a new [`Note`] instance.
* @param {KordInterval} interval
* @returns {KordNote}
*/
  subInterval(interval: KordInterval): KordNote;
/**
* Computes the [`Interval`] distance between the [`Note`] and the given [`Note`].
* @param {KordNote} other
* @returns {KordInterval}
*/
  distanceTo(other: KordNote): KordInterval;
/**
* Returns the primary (first 13) harmonic series of the [`Note`].
* @returns {Array<any>}
*/
  harmonicSeries(): Array<any>;
/**
* Returns the clone of the [`Note`].
* @returns {KordNote}
*/
  copy(): KordNote;
}
/**
* A handle to a [`Chord`] playback.
*
* Should be dropped to stop the playback, or after playback is finished.
*/
export class KordPlaybackHandle {
  free(): void;
}
