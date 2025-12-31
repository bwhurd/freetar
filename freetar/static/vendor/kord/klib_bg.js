const lAudioContext = (typeof AudioContext !== 'undefined' ? AudioContext : (typeof webkitAudioContext !== 'undefined' ? webkitAudioContext : undefined));
let wasm;
export function __wbg_set_wasm(val) {
    wasm = val;
}


const heap = new Array(128).fill(undefined);

heap.push(undefined, null, true, false);

function getObject(idx) { return heap[idx]; }

let heap_next = heap.length;

function dropObject(idx) {
    if (idx < 132) return;
    heap[idx] = heap_next;
    heap_next = idx;
}

function takeObject(idx) {
    const ret = getObject(idx);
    dropObject(idx);
    return ret;
}

const lTextDecoder = typeof TextDecoder === 'undefined' ? (0, module.require)('util').TextDecoder : TextDecoder;

let cachedTextDecoder = new lTextDecoder('utf-8', { ignoreBOM: true, fatal: true });

cachedTextDecoder.decode();

let cachedUint8Memory0 = null;

function getUint8Memory0() {
    if (cachedUint8Memory0 === null || cachedUint8Memory0.byteLength === 0) {
        cachedUint8Memory0 = new Uint8Array(wasm.memory.buffer);
    }
    return cachedUint8Memory0;
}

function getStringFromWasm0(ptr, len) {
    ptr = ptr >>> 0;
    return cachedTextDecoder.decode(getUint8Memory0().subarray(ptr, ptr + len));
}

function addHeapObject(obj) {
    if (heap_next === heap.length) heap.push(heap.length + 1);
    const idx = heap_next;
    heap_next = heap[idx];

    heap[idx] = obj;
    return idx;
}

function isLikeNone(x) {
    return x === undefined || x === null;
}

let cachedFloat64Memory0 = null;

function getFloat64Memory0() {
    if (cachedFloat64Memory0 === null || cachedFloat64Memory0.byteLength === 0) {
        cachedFloat64Memory0 = new Float64Array(wasm.memory.buffer);
    }
    return cachedFloat64Memory0;
}

let cachedInt32Memory0 = null;

function getInt32Memory0() {
    if (cachedInt32Memory0 === null || cachedInt32Memory0.byteLength === 0) {
        cachedInt32Memory0 = new Int32Array(wasm.memory.buffer);
    }
    return cachedInt32Memory0;
}

let WASM_VECTOR_LEN = 0;

const lTextEncoder = typeof TextEncoder === 'undefined' ? (0, module.require)('util').TextEncoder : TextEncoder;

let cachedTextEncoder = new lTextEncoder('utf-8');

const encodeString = (typeof cachedTextEncoder.encodeInto === 'function'
    ? function (arg, view) {
    return cachedTextEncoder.encodeInto(arg, view);
}
    : function (arg, view) {
    const buf = cachedTextEncoder.encode(arg);
    view.set(buf);
    return {
        read: arg.length,
        written: buf.length
    };
});

function passStringToWasm0(arg, malloc, realloc) {

    if (realloc === undefined) {
        const buf = cachedTextEncoder.encode(arg);
        const ptr = malloc(buf.length, 1) >>> 0;
        getUint8Memory0().subarray(ptr, ptr + buf.length).set(buf);
        WASM_VECTOR_LEN = buf.length;
        return ptr;
    }

    let len = arg.length;
    let ptr = malloc(len, 1) >>> 0;

    const mem = getUint8Memory0();

    let offset = 0;

    for (; offset < len; offset++) {
        const code = arg.charCodeAt(offset);
        if (code > 0x7F) break;
        mem[ptr + offset] = code;
    }

    if (offset !== len) {
        if (offset !== 0) {
            arg = arg.slice(offset);
        }
        ptr = realloc(ptr, len, len = offset + arg.length * 3, 1) >>> 0;
        const view = getUint8Memory0().subarray(ptr + offset, ptr + len);
        const ret = encodeString(arg, view);

        offset += ret.written;
    }

    WASM_VECTOR_LEN = offset;
    return ptr;
}

function debugString(val) {
    // primitive types
    const type = typeof val;
    if (type == 'number' || type == 'boolean' || val == null) {
        return  `${val}`;
    }
    if (type == 'string') {
        return `"${val}"`;
    }
    if (type == 'symbol') {
        const description = val.description;
        if (description == null) {
            return 'Symbol';
        } else {
            return `Symbol(${description})`;
        }
    }
    if (type == 'function') {
        const name = val.name;
        if (typeof name == 'string' && name.length > 0) {
            return `Function(${name})`;
        } else {
            return 'Function';
        }
    }
    // objects
    if (Array.isArray(val)) {
        const length = val.length;
        let debug = '[';
        if (length > 0) {
            debug += debugString(val[0]);
        }
        for(let i = 1; i < length; i++) {
            debug += ', ' + debugString(val[i]);
        }
        debug += ']';
        return debug;
    }
    // Test for built-in
    const builtInMatches = /\[object ([^\]]+)\]/.exec(toString.call(val));
    let className;
    if (builtInMatches.length > 1) {
        className = builtInMatches[1];
    } else {
        // Failed to match the standard '[object ClassName]'
        return toString.call(val);
    }
    if (className == 'Object') {
        // we're a user defined class or Object
        // JSON.stringify avoids problems with cycles, and is generally much
        // easier than looping through ownProperties of `val`.
        try {
            return 'Object(' + JSON.stringify(val) + ')';
        } catch (_) {
            return 'Object';
        }
    }
    // errors
    if (val instanceof Error) {
        return `${val.name}: ${val.message}\n${val.stack}`;
    }
    // TODO we could test for more things here, like `Set`s and `Map`s.
    return className;
}

function makeMutClosure(arg0, arg1, dtor, f) {
    const state = { a: arg0, b: arg1, cnt: 1, dtor };
    const real = (...args) => {
        // First up with a closure we increment the internal reference
        // count. This ensures that the Rust closure environment won't
        // be deallocated while we're invoking it.
        state.cnt++;
        const a = state.a;
        state.a = 0;
        try {
            return f(a, state.b, ...args);
        } finally {
            if (--state.cnt === 0) {
                wasm.__wbindgen_export_2.get(state.dtor)(a, state.b);

            } else {
                state.a = a;
            }
        }
    };
    real.original = state;

    return real;
}
function __wbg_adapter_32(arg0, arg1, arg2) {
    wasm.wasm_bindgen__convert__closures__invoke1_mut__h7ae5fa43571d2d1a(arg0, arg1, addHeapObject(arg2));
}

function __wbg_adapter_35(arg0, arg1) {
    wasm.wasm_bindgen__convert__closures__invoke0_mut__h9a3cc0c6ffc8f26a(arg0, arg1);
}

function __wbg_adapter_38(arg0, arg1) {
    wasm.wasm_bindgen__convert__closures__invoke0_mut__hddbc9bcc7c6455be(arg0, arg1);
}

let cachedFloat32Memory0 = null;

function getFloat32Memory0() {
    if (cachedFloat32Memory0 === null || cachedFloat32Memory0.byteLength === 0) {
        cachedFloat32Memory0 = new Float32Array(wasm.memory.buffer);
    }
    return cachedFloat32Memory0;
}

function passArrayF32ToWasm0(arg, malloc) {
    const ptr = malloc(arg.length * 4, 4) >>> 0;
    getFloat32Memory0().set(arg, ptr / 4);
    WASM_VECTOR_LEN = arg.length;
    return ptr;
}

function _assertClass(instance, klass) {
    if (!(instance instanceof klass)) {
        throw new Error(`expected instance of ${klass.name}`);
    }
    return instance.ptr;
}

function handleError(f, args) {
    try {
        return f.apply(this, args);
    } catch (e) {
        wasm.__wbindgen_exn_store(addHeapObject(e));
    }
}

function getArrayF32FromWasm0(ptr, len) {
    ptr = ptr >>> 0;
    return getFloat32Memory0().subarray(ptr / 4, ptr / 4 + len);
}
function __wbg_adapter_176(arg0, arg1, arg2, arg3) {
    wasm.wasm_bindgen__convert__closures__invoke2_mut__h1c849f10298b6e57(arg0, arg1, addHeapObject(arg2), addHeapObject(arg3));
}

/**
* The chord modifiers.
*/
export const KordModifier = Object.freeze({
/**
* Minor modifier.
*/
Minor:0,"0":"Minor",
/**
* Flat 5 modifier.
*/
Flat5:1,"1":"Flat5",
/**
* Sharp 5 modifier.
*/
Augmented5:2,"2":"Augmented5",
/**
* Major 7 modifier.
*/
Major7:3,"3":"Major7",
/**
* Dominant 7 modifier.
*/
Dominant7:4,"4":"Dominant7",
/**
* Dominant 9 modifier.
*/
Dominant9:5,"5":"Dominant9",
/**
* Dominant 11 modifier.
*/
Dominant11:6,"6":"Dominant11",
/**
* Dominant 13 modifier.
*/
Dominant13:7,"7":"Dominant13",
/**
* Flat 9 modifier.
*/
Flat9:8,"8":"Flat9",
/**
* Sharp 9 modifier.
*/
Sharp9:9,"9":"Sharp9",
/**
* Sharp 11 modifier.
*/
Sharp11:10,"10":"Sharp11",
/**
* Diminished modifier.
*/
Diminished:11,"11":"Diminished", });
/**
* An enum representing the interval between two notes.
*/
export const KordInterval = Object.freeze({
/**
* A perfect unison interval.
*/
PerfectUnison:0,"0":"PerfectUnison",
/**
* A diminished second interval.
*/
DiminishedSecond:1,"1":"DiminishedSecond",
/**
* An augmented unison interval.
*/
AugmentedUnison:2,"2":"AugmentedUnison",
/**
* A minor second interval.
*/
MinorSecond:3,"3":"MinorSecond",
/**
* A major second interval.
*/
MajorSecond:4,"4":"MajorSecond",
/**
* A diminished third interval.
*/
DiminishedThird:5,"5":"DiminishedThird",
/**
* An augmented second interval.
*/
AugmentedSecond:6,"6":"AugmentedSecond",
/**
* A minor third interval.
*/
MinorThird:7,"7":"MinorThird",
/**
* A major third interval.
*/
MajorThird:8,"8":"MajorThird",
/**
* A diminished fourth interval.
*/
DiminishedFourth:9,"9":"DiminishedFourth",
/**
* An augmented third interval.
*/
AugmentedThird:10,"10":"AugmentedThird",
/**
* A perfect fourth interval.
*/
PerfectFourth:11,"11":"PerfectFourth",
/**
* An augmented fourth interval.
*/
AugmentedFourth:12,"12":"AugmentedFourth",
/**
* A diminished fifth interval.
*/
DiminishedFifth:13,"13":"DiminishedFifth",
/**
* A perfect fifth interval.
*/
PerfectFifth:14,"14":"PerfectFifth",
/**
* A diminished sixth interval.
*/
DiminishedSixth:15,"15":"DiminishedSixth",
/**
* An augmented fifth interval.
*/
AugmentedFifth:16,"16":"AugmentedFifth",
/**
* A minor sixth interval.
*/
MinorSixth:17,"17":"MinorSixth",
/**
* A major sixth interval.
*/
MajorSixth:18,"18":"MajorSixth",
/**
* A diminished seventh interval.
*/
DiminishedSeventh:19,"19":"DiminishedSeventh",
/**
* An augmented sixth interval.
*/
AugmentedSixth:20,"20":"AugmentedSixth",
/**
* A minor seventh interval.
*/
MinorSeventh:21,"21":"MinorSeventh",
/**
* A major seventh interval.
*/
MajorSeventh:22,"22":"MajorSeventh",
/**
* A diminished octave interval.
*/
DiminishedOctave:23,"23":"DiminishedOctave",
/**
* An augmented seventh interval.
*/
AugmentedSeventh:24,"24":"AugmentedSeventh",
/**
* A perfect octave interval.
*/
PerfectOctave:25,"25":"PerfectOctave",
/**
* An minor ninth interval.
*/
MinorNinth:26,"26":"MinorNinth",
/**
* A major ninth interval.
*/
MajorNinth:27,"27":"MajorNinth",
/**
* An augmented ninth interval.
*/
AugmentedNinth:28,"28":"AugmentedNinth",
/**
* A diminished eleventh interval.
*/
DiminishedEleventh:29,"29":"DiminishedEleventh",
/**
* A perfect eleventh interval.
*/
PerfectEleventh:30,"30":"PerfectEleventh",
/**
* An augmented eleventh interval.
*/
AugmentedEleventh:31,"31":"AugmentedEleventh",
/**
* A minor thirteenth interval.
*/
MinorThirteenth:32,"32":"MinorThirteenth",
/**
* A major thirteenth interval.
*/
MajorThirteenth:33,"33":"MajorThirteenth",
/**
* An augmented thirteenth interval.
*/
AugmentedThirteenth:34,"34":"AugmentedThirteenth",
/**
* A perfect octave and perfect fifth interval.
*/
PerfectOctaveAndPerfectFifth:35,"35":"PerfectOctaveAndPerfectFifth",
/**
* Two perfect octaves.
*/
TwoPerfectOctaves:36,"36":"TwoPerfectOctaves",
/**
* Two perfect octaves and a major third.
*/
TwoPerfectOctavesAndMajorThird:37,"37":"TwoPerfectOctavesAndMajorThird",
/**
* Two perfect octaves and a perfect fifth.
*/
TwoPerfectOctavesAndPerfectFifth:38,"38":"TwoPerfectOctavesAndPerfectFifth",
/**
* Two perfect octaves and a minor sixth.
*/
TwoPerfectOctavesAndMinorSeventh:39,"39":"TwoPerfectOctavesAndMinorSeventh",
/**
* Three perfect octaves.
*/
ThreePerfectOctaves:40,"40":"ThreePerfectOctaves",
/**
* Three perfect octaves and a major second.
*/
ThreePerfectOctavesAndMajorSecond:41,"41":"ThreePerfectOctavesAndMajorSecond",
/**
* Three perfect octaves and a major third.
*/
ThreePerfectOctavesAndMajorThird:42,"42":"ThreePerfectOctavesAndMajorThird",
/**
* Three perfect octaves and an augmented fourth.
*/
ThreePerfectOctavesAndAugmentedFourth:43,"43":"ThreePerfectOctavesAndAugmentedFourth",
/**
* Three perfect octaves and a perfect fifth.
*/
ThreePerfectOctavesAndPerfectFifth:44,"44":"ThreePerfectOctavesAndPerfectFifth",
/**
* Three perfect octaves and a minor sixth.
*/
ThreePerfectOctavesAndMinorSixth:45,"45":"ThreePerfectOctavesAndMinorSixth",
/**
* Three perfect octaves and a minor seventh.
*/
ThreePerfectOctavesAndMinorSeventh:46,"46":"ThreePerfectOctavesAndMinorSeventh",
/**
* Three perfect octaves and a major seventh.
*/
ThreePerfectOctavesAndMajorSeventh:47,"47":"ThreePerfectOctavesAndMajorSeventh", });
/**
* An enum representing the extension of a chord.
*
* Extensions are not really "special" in the sense that they do not change how the
* chord is interpreted by the system.  E.g., an `add2` just adds a 2 to the chord,
* and the chord is still interpreted as a major chord.
*/
export const KordExtension = Object.freeze({
/**
* Sus2 extension.
*/
Sus2:0,"0":"Sus2",
/**
* Sus4 extension.
*/
Sus4:1,"1":"Sus4",
/**
* Flat 11 extension.
*/
Flat11:2,"2":"Flat11",
/**
* Flat 13 extension.
*/
Flat13:3,"3":"Flat13",
/**
* Sharp 13 extension.
*/
Sharp13:4,"4":"Sharp13",
/**
* Add2 extension.
*/
Add2:5,"5":"Add2",
/**
* Add4 extension.
*/
Add4:6,"6":"Add4",
/**
* Add6 extension.
*/
Add6:7,"7":"Add6",
/**
* Add9 extension.
*/
Add9:8,"8":"Add9",
/**
* Add11 extension.
*/
Add11:9,"9":"Add11",
/**
* Add13 extension.
*/
Add13:10,"10":"Add13", });
/**
* The [`Chord`] wrapper.
*/
export class KordChord {

    static __wrap(ptr) {
        ptr = ptr >>> 0;
        const obj = Object.create(KordChord.prototype);
        obj.__wbg_ptr = ptr;

        return obj;
    }

    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;

        return ptr;
    }

    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_kordchord_free(ptr);
    }
    /**
    * Creates a new [`Chord`] from a frequency.
    * @param {string} name
    * @returns {KordChord}
    */
    static parse(name) {
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            const ptr0 = passStringToWasm0(name, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
            const len0 = WASM_VECTOR_LEN;
            wasm.kordchord_parse(retptr, ptr0, len0);
            var r0 = getInt32Memory0()[retptr / 4 + 0];
            var r1 = getInt32Memory0()[retptr / 4 + 1];
            var r2 = getInt32Memory0()[retptr / 4 + 2];
            if (r2) {
                throw takeObject(r1);
            }
            return KordChord.__wrap(r0);
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
        }
    }
    /**
    * Creates a new [`Chord`] from a set of [`Note`]s.
    *
    * The [`Note`]s should be represented as a space-separated string.
    * E.g., `C E G`.
    * @param {string} notes
    * @returns {Array<any>}
    */
    static fromNotesString(notes) {
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            const ptr0 = passStringToWasm0(notes, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
            const len0 = WASM_VECTOR_LEN;
            wasm.kordchord_fromNotesString(retptr, ptr0, len0);
            var r0 = getInt32Memory0()[retptr / 4 + 0];
            var r1 = getInt32Memory0()[retptr / 4 + 1];
            var r2 = getInt32Memory0()[retptr / 4 + 2];
            if (r2) {
                throw takeObject(r1);
            }
            return takeObject(r0);
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
        }
    }
    /**
    * Creates a new [`Chord`] from a set of [`Note`]s.
    * @param {Array<any>} notes
    * @returns {Array<any>}
    */
    static fromNotes(notes) {
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            wasm.kordchord_fromNotes(retptr, addHeapObject(notes));
            var r0 = getInt32Memory0()[retptr / 4 + 0];
            var r1 = getInt32Memory0()[retptr / 4 + 1];
            var r2 = getInt32Memory0()[retptr / 4 + 2];
            if (r2) {
                throw takeObject(r1);
            }
            return takeObject(r0);
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
        }
    }
    /**
    * Returns the [`Chord`]'s friendly name.
    * @returns {string}
    */
    name() {
        let deferred1_0;
        let deferred1_1;
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            wasm.kordchord_name(retptr, this.__wbg_ptr);
            var r0 = getInt32Memory0()[retptr / 4 + 0];
            var r1 = getInt32Memory0()[retptr / 4 + 1];
            deferred1_0 = r0;
            deferred1_1 = r1;
            return getStringFromWasm0(r0, r1);
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
    /**
    * Returns the [`Chord`]'s precise name.
    * @returns {string}
    */
    preciseName() {
        let deferred1_0;
        let deferred1_1;
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            wasm.kordchord_preciseName(retptr, this.__wbg_ptr);
            var r0 = getInt32Memory0()[retptr / 4 + 0];
            var r1 = getInt32Memory0()[retptr / 4 + 1];
            deferred1_0 = r0;
            deferred1_1 = r1;
            return getStringFromWasm0(r0, r1);
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
    /**
    * Returns the [`Chord`] as a string (same as `precise_name`).
    * @returns {string}
    */
    toString() {
        let deferred1_0;
        let deferred1_1;
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            wasm.kordchord_preciseName(retptr, this.__wbg_ptr);
            var r0 = getInt32Memory0()[retptr / 4 + 0];
            var r1 = getInt32Memory0()[retptr / 4 + 1];
            deferred1_0 = r0;
            deferred1_1 = r1;
            return getStringFromWasm0(r0, r1);
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
    /**
    * Returns the [`Chord`]'s description.
    * @returns {string}
    */
    description() {
        let deferred1_0;
        let deferred1_1;
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            wasm.kordchord_description(retptr, this.__wbg_ptr);
            var r0 = getInt32Memory0()[retptr / 4 + 0];
            var r1 = getInt32Memory0()[retptr / 4 + 1];
            deferred1_0 = r0;
            deferred1_1 = r1;
            return getStringFromWasm0(r0, r1);
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
    /**
    * Returns the [`Chord`]'s display text.
    * @returns {string}
    */
    display() {
        let deferred1_0;
        let deferred1_1;
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            wasm.kordchord_display(retptr, this.__wbg_ptr);
            var r0 = getInt32Memory0()[retptr / 4 + 0];
            var r1 = getInt32Memory0()[retptr / 4 + 1];
            deferred1_0 = r0;
            deferred1_1 = r1;
            return getStringFromWasm0(r0, r1);
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
    /**
    * Returns the [`Chord`]'s root note.
    * @returns {string}
    */
    root() {
        let deferred1_0;
        let deferred1_1;
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            wasm.kordchord_root(retptr, this.__wbg_ptr);
            var r0 = getInt32Memory0()[retptr / 4 + 0];
            var r1 = getInt32Memory0()[retptr / 4 + 1];
            deferred1_0 = r0;
            deferred1_1 = r1;
            return getStringFromWasm0(r0, r1);
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
    /**
    * Returns the [`Chord`]'s slash note.
    * @returns {string}
    */
    slash() {
        let deferred1_0;
        let deferred1_1;
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            wasm.kordchord_slash(retptr, this.__wbg_ptr);
            var r0 = getInt32Memory0()[retptr / 4 + 0];
            var r1 = getInt32Memory0()[retptr / 4 + 1];
            deferred1_0 = r0;
            deferred1_1 = r1;
            return getStringFromWasm0(r0, r1);
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
    /**
    * Returns the [`Chord`]'s inversion.
    * @returns {number}
    */
    inversion() {
        const ret = wasm.kordchord_inversion(this.__wbg_ptr);
        return ret;
    }
    /**
    * Returns whether or not the [`Chord`] is "crunchy".
    * @returns {boolean}
    */
    isCrunchy() {
        const ret = wasm.kordchord_isCrunchy(this.__wbg_ptr);
        return ret !== 0;
    }
    /**
    * Returns the [`Chord`]'s chord tones.
    * @returns {Array<any>}
    */
    chord() {
        const ret = wasm.kordchord_chord(this.__wbg_ptr);
        return takeObject(ret);
    }
    /**
    * Returns the [`Chord`]'s chord tones as a string.
    * @returns {string}
    */
    chordString() {
        let deferred1_0;
        let deferred1_1;
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            wasm.kordchord_chordString(retptr, this.__wbg_ptr);
            var r0 = getInt32Memory0()[retptr / 4 + 0];
            var r1 = getInt32Memory0()[retptr / 4 + 1];
            deferred1_0 = r0;
            deferred1_1 = r1;
            return getStringFromWasm0(r0, r1);
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
    /**
    * Returns the [`Chord`]'s scale tones.
    * @returns {Array<any>}
    */
    scale() {
        const ret = wasm.kordchord_scale(this.__wbg_ptr);
        return takeObject(ret);
    }
    /**
    * Returns the [`Chord`]'s scale tones as a string.
    * @returns {string}
    */
    scaleString() {
        let deferred1_0;
        let deferred1_1;
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            wasm.kordchord_scaleString(retptr, this.__wbg_ptr);
            var r0 = getInt32Memory0()[retptr / 4 + 0];
            var r1 = getInt32Memory0()[retptr / 4 + 1];
            deferred1_0 = r0;
            deferred1_1 = r1;
            return getStringFromWasm0(r0, r1);
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
    /**
    * Returns the [`Chord`]'s modifiers.
    * @returns {Array<any>}
    */
    modifiers() {
        const ret = wasm.kordchord_modifiers(this.__wbg_ptr);
        return takeObject(ret);
    }
    /**
    * Returns the [`Chord`]'s extensions.
    * @returns {Array<any>}
    */
    extensions() {
        const ret = wasm.kordchord_extensions(this.__wbg_ptr);
        return takeObject(ret);
    }
    /**
    * Returns a new [`Chord`] with the inversion set to the provided value.
    * @param {number} inversion
    * @returns {KordChord}
    */
    withInversion(inversion) {
        const ret = wasm.kordchord_withInversion(this.__wbg_ptr, inversion);
        return KordChord.__wrap(ret);
    }
    /**
    * Returns a new [`Chord`] with the slash set to the provided value.
    * @param {KordNote} slash
    * @returns {KordChord}
    */
    withSlash(slash) {
        _assertClass(slash, KordNote);
        const ret = wasm.kordchord_withSlash(this.__wbg_ptr, slash.__wbg_ptr);
        return KordChord.__wrap(ret);
    }
    /**
    * Returns a new [`Chord`] with the octave of the root set to the provided value.
    * @param {number} octave
    * @returns {KordChord}
    */
    withOctave(octave) {
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            wasm.kordchord_withOctave(retptr, this.__wbg_ptr, octave);
            var r0 = getInt32Memory0()[retptr / 4 + 0];
            var r1 = getInt32Memory0()[retptr / 4 + 1];
            var r2 = getInt32Memory0()[retptr / 4 + 2];
            if (r2) {
                throw takeObject(r1);
            }
            return KordChord.__wrap(r0);
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
        }
    }
    /**
    * Returns a new [`Chord`] with the "crunchiness" set to the provided value.
    * @param {boolean} is_crunchy
    * @returns {KordChord}
    */
    withCrunchy(is_crunchy) {
        const ret = wasm.kordchord_withCrunchy(this.__wbg_ptr, is_crunchy);
        return KordChord.__wrap(ret);
    }
    /**
    * Plays the [`Chord`].
    * @param {number} delay
    * @param {number} length
    * @param {number} fade_in
    * @returns {Promise<void>}
    */
    play(delay, length, fade_in) {
        const ret = wasm.kordchord_play(this.__wbg_ptr, delay, length, fade_in);
        return takeObject(ret);
    }
    /**
    * Returns the clone of the [`Chord`].
    * @returns {KordChord}
    */
    copy() {
        const ret = wasm.kordchord_copy(this.__wbg_ptr);
        return KordChord.__wrap(ret);
    }
    /**
    * Returns a new [`Chord`] with the `minor` modifier.
    * @returns {KordChord}
    */
    minor() {
        const ret = wasm.kordchord_minor(this.__wbg_ptr);
        return KordChord.__wrap(ret);
    }
    /**
    * Returns a new [`Chord`] with the `flat5` modifier.
    * @returns {KordChord}
    */
    flat5() {
        const ret = wasm.kordchord_flat5(this.__wbg_ptr);
        return KordChord.__wrap(ret);
    }
    /**
    * Returns a new [`Chord`] with the `augmented` modifier.
    * @returns {KordChord}
    */
    aug() {
        const ret = wasm.kordchord_aug(this.__wbg_ptr);
        return KordChord.__wrap(ret);
    }
    /**
    * Returns a new [`Chord`] with the `maj7` modifier.
    * @returns {KordChord}
    */
    maj7() {
        const ret = wasm.kordchord_maj7(this.__wbg_ptr);
        return KordChord.__wrap(ret);
    }
    /**
    * Returns a new [`Chord`] with the `dom7` modifier.
    * @returns {KordChord}
    */
    seven() {
        const ret = wasm.kordchord_seven(this.__wbg_ptr);
        return KordChord.__wrap(ret);
    }
    /**
    * Returns a new [`Chord`] with the `dom9` modifier.
    * @returns {KordChord}
    */
    nine() {
        const ret = wasm.kordchord_nine(this.__wbg_ptr);
        return KordChord.__wrap(ret);
    }
    /**
    * Returns a new [`Chord`] with the `dom11` modifier.
    * @returns {KordChord}
    */
    eleven() {
        const ret = wasm.kordchord_eleven(this.__wbg_ptr);
        return KordChord.__wrap(ret);
    }
    /**
    * Returns a new [`Chord`] with the `dom13` modifier.
    * @returns {KordChord}
    */
    thirteen() {
        const ret = wasm.kordchord_thirteen(this.__wbg_ptr);
        return KordChord.__wrap(ret);
    }
    /**
    * Returns a new [`Chord`] with the `flat9` modifier.
    * @returns {KordChord}
    */
    flat9() {
        const ret = wasm.kordchord_flat9(this.__wbg_ptr);
        return KordChord.__wrap(ret);
    }
    /**
    * Returns a new [`Chord`] with the `sharp9` modifier.
    * @returns {KordChord}
    */
    sharp9() {
        const ret = wasm.kordchord_sharp9(this.__wbg_ptr);
        return KordChord.__wrap(ret);
    }
    /**
    * Returns a new [`Chord`] with the `sharp11` modifier.
    * @returns {KordChord}
    */
    sharp11() {
        const ret = wasm.kordchord_sharp11(this.__wbg_ptr);
        return KordChord.__wrap(ret);
    }
    /**
    * Returns a new [`Chord`] with the `dim` modifier.
    * @returns {KordChord}
    */
    dim() {
        const ret = wasm.kordchord_dim(this.__wbg_ptr);
        return KordChord.__wrap(ret);
    }
    /**
    * Returns a new [`Chord`] with the `halfDim` modifier.
    * @returns {KordChord}
    */
    halfDim() {
        const ret = wasm.kordchord_halfDim(this.__wbg_ptr);
        return KordChord.__wrap(ret);
    }
    /**
    * Returns a new [`Chord`] with the `sus2` extension.
    * @returns {KordChord}
    */
    sus2() {
        const ret = wasm.kordchord_sus2(this.__wbg_ptr);
        return KordChord.__wrap(ret);
    }
    /**
    * Returns a new [`Chord`] with the `sus4` extension.
    * @returns {KordChord}
    */
    sus4() {
        const ret = wasm.kordchord_sus4(this.__wbg_ptr);
        return KordChord.__wrap(ret);
    }
    /**
    * Returns a new [`Chord`] with the `flat11` extension.
    * @returns {KordChord}
    */
    flat11() {
        const ret = wasm.kordchord_flat11(this.__wbg_ptr);
        return KordChord.__wrap(ret);
    }
    /**
    * Returns a new [`Chord`] with the `flat13` extension.
    * @returns {KordChord}
    */
    flat13() {
        const ret = wasm.kordchord_flat13(this.__wbg_ptr);
        return KordChord.__wrap(ret);
    }
    /**
    * Returns a new [`Chord`] with the `sharp13` extension.
    * @returns {KordChord}
    */
    sharp13() {
        const ret = wasm.kordchord_sharp13(this.__wbg_ptr);
        return KordChord.__wrap(ret);
    }
    /**
    * Returns a new [`Chord`] with the `add2` extension.
    * @returns {KordChord}
    */
    add2() {
        const ret = wasm.kordchord_add2(this.__wbg_ptr);
        return KordChord.__wrap(ret);
    }
    /**
    * Returns a new [`Chord`] with the `add4` extension.
    * @returns {KordChord}
    */
    add4() {
        const ret = wasm.kordchord_add4(this.__wbg_ptr);
        return KordChord.__wrap(ret);
    }
    /**
    * Returns a new [`Chord`] with the `add6` extension.
    * @returns {KordChord}
    */
    add6() {
        const ret = wasm.kordchord_add6(this.__wbg_ptr);
        return KordChord.__wrap(ret);
    }
    /**
    * Returns a new [`Chord`] with the `add9` extension.
    * @returns {KordChord}
    */
    add9() {
        const ret = wasm.kordchord_add9(this.__wbg_ptr);
        return KordChord.__wrap(ret);
    }
    /**
    * Returns a new [`Chord`] with the `add11` extension.
    * @returns {KordChord}
    */
    add11() {
        const ret = wasm.kordchord_add11(this.__wbg_ptr);
        return KordChord.__wrap(ret);
    }
    /**
    * Returns a new [`Chord`] with the `add13` extension.
    * @returns {KordChord}
    */
    add13() {
        const ret = wasm.kordchord_add13(this.__wbg_ptr);
        return KordChord.__wrap(ret);
    }
}
/**
* The [`Note`] wrapper.
*/
export class KordNote {

    static __wrap(ptr) {
        ptr = ptr >>> 0;
        const obj = Object.create(KordNote.prototype);
        obj.__wbg_ptr = ptr;

        return obj;
    }

    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;

        return ptr;
    }

    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_kordnote_free(ptr);
    }
    /**
    * Creates a new [`Note`] from a frequency.
    * @param {string} name
    * @returns {KordNote}
    */
    static parse(name) {
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            const ptr0 = passStringToWasm0(name, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
            const len0 = WASM_VECTOR_LEN;
            wasm.kordnote_parse(retptr, ptr0, len0);
            var r0 = getInt32Memory0()[retptr / 4 + 0];
            var r1 = getInt32Memory0()[retptr / 4 + 1];
            var r2 = getInt32Memory0()[retptr / 4 + 2];
            if (r2) {
                throw takeObject(r1);
            }
            return KordNote.__wrap(r0);
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
        }
    }
    /**
    * Returns [`Note`]s from audio data.
    * @param {Float32Array} data
    * @param {number} length_in_seconds
    * @returns {Array<any>}
    */
    static fromAudio(data, length_in_seconds) {
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            const ptr0 = passArrayF32ToWasm0(data, wasm.__wbindgen_malloc);
            const len0 = WASM_VECTOR_LEN;
            wasm.kordnote_fromAudio(retptr, ptr0, len0, length_in_seconds);
            var r0 = getInt32Memory0()[retptr / 4 + 0];
            var r1 = getInt32Memory0()[retptr / 4 + 1];
            var r2 = getInt32Memory0()[retptr / 4 + 2];
            if (r2) {
                throw takeObject(r1);
            }
            return takeObject(r0);
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
        }
    }
    /**
    * Returns [`Note`]s from audio data using the ML inference algorithm.
    * @param {Float32Array} data
    * @param {number} length_in_seconds
    * @returns {Array<any>}
    */
    static fromAudioMl(data, length_in_seconds) {
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            const ptr0 = passArrayF32ToWasm0(data, wasm.__wbindgen_malloc);
            const len0 = WASM_VECTOR_LEN;
            wasm.kordnote_fromAudioMl(retptr, ptr0, len0, length_in_seconds);
            var r0 = getInt32Memory0()[retptr / 4 + 0];
            var r1 = getInt32Memory0()[retptr / 4 + 1];
            var r2 = getInt32Memory0()[retptr / 4 + 2];
            if (r2) {
                throw takeObject(r1);
            }
            return takeObject(r0);
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
        }
    }
    /**
    * Returns the [`Note`]'s friendly name.
    * @returns {string}
    */
    name() {
        let deferred1_0;
        let deferred1_1;
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            wasm.kordnote_name(retptr, this.__wbg_ptr);
            var r0 = getInt32Memory0()[retptr / 4 + 0];
            var r1 = getInt32Memory0()[retptr / 4 + 1];
            deferred1_0 = r0;
            deferred1_1 = r1;
            return getStringFromWasm0(r0, r1);
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
    /**
    * Returns the [`Note`] represented as a string (same as `name`).
    * @returns {string}
    */
    toString() {
        let deferred1_0;
        let deferred1_1;
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            wasm.kordnote_toString(retptr, this.__wbg_ptr);
            var r0 = getInt32Memory0()[retptr / 4 + 0];
            var r1 = getInt32Memory0()[retptr / 4 + 1];
            deferred1_0 = r0;
            deferred1_1 = r1;
            return getStringFromWasm0(r0, r1);
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
    /**
    * Returns the [`Note`]'s [`NamedPitch`].
    * @returns {string}
    */
    pitch() {
        let deferred1_0;
        let deferred1_1;
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            wasm.kordnote_pitch(retptr, this.__wbg_ptr);
            var r0 = getInt32Memory0()[retptr / 4 + 0];
            var r1 = getInt32Memory0()[retptr / 4 + 1];
            deferred1_0 = r0;
            deferred1_1 = r1;
            return getStringFromWasm0(r0, r1);
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
    /**
    * Returns the [`Note`]'s [`Octave`].
    * @returns {number}
    */
    octave() {
        const ret = wasm.kordnote_octave(this.__wbg_ptr);
        return ret;
    }
    /**
    * Returns the [`Note`]'s frequency.
    * @returns {number}
    */
    frequency() {
        const ret = wasm.kordnote_frequency(this.__wbg_ptr);
        return ret;
    }
    /**
    * Adds the given interval to the [`Note`], producing a new [`Note`] instance.
    * @param {KordInterval} interval
    * @returns {KordNote}
    */
    addInterval(interval) {
        const ret = wasm.kordnote_addInterval(this.__wbg_ptr, interval);
        return KordNote.__wrap(ret);
    }
    /**
    * Subtracts the given interval from the [`Note`], producing a new [`Note`] instance.
    * @param {KordInterval} interval
    * @returns {KordNote}
    */
    subInterval(interval) {
        const ret = wasm.kordnote_subInterval(this.__wbg_ptr, interval);
        return KordNote.__wrap(ret);
    }
    /**
    * Computes the [`Interval`] distance between the [`Note`] and the given [`Note`].
    * @param {KordNote} other
    * @returns {KordInterval}
    */
    distanceTo(other) {
        _assertClass(other, KordNote);
        var ptr0 = other.__destroy_into_raw();
        const ret = wasm.kordnote_distanceTo(this.__wbg_ptr, ptr0);
        return ret;
    }
    /**
    * Returns the primary (first 13) harmonic series of the [`Note`].
    * @returns {Array<any>}
    */
    harmonicSeries() {
        const ret = wasm.kordnote_harmonicSeries(this.__wbg_ptr);
        return takeObject(ret);
    }
    /**
    * Returns the clone of the [`Note`].
    * @returns {KordNote}
    */
    copy() {
        const ret = wasm.kordnote_copy(this.__wbg_ptr);
        return KordNote.__wrap(ret);
    }
}
/**
* A handle to a [`Chord`] playback.
*
* Should be dropped to stop the playback, or after playback is finished.
*/
export class KordPlaybackHandle {

    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;

        return ptr;
    }

    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_kordplaybackhandle_free(ptr);
    }
}

export function __wbindgen_object_drop_ref(arg0) {
    takeObject(arg0);
};

export function __wbindgen_cb_drop(arg0) {
    const obj = takeObject(arg0).original;
    if (obj.cnt-- == 1) {
        obj.a = 0;
        return true;
    }
    const ret = false;
    return ret;
};

export function __wbindgen_string_new(arg0, arg1) {
    const ret = getStringFromWasm0(arg0, arg1);
    return addHeapObject(ret);
};

export function __wbindgen_number_get(arg0, arg1) {
    const obj = getObject(arg1);
    const ret = typeof(obj) === 'number' ? obj : undefined;
    getFloat64Memory0()[arg0 / 8 + 1] = isLikeNone(ret) ? 0 : ret;
    getInt32Memory0()[arg0 / 4 + 0] = !isLikeNone(ret);
};

export function __wbg_kordchord_new(arg0) {
    const ret = KordChord.__wrap(arg0);
    return addHeapObject(ret);
};

export function __wbg_kordnote_new(arg0) {
    const ret = KordNote.__wrap(arg0);
    return addHeapObject(ret);
};

export function __wbindgen_number_new(arg0) {
    const ret = arg0;
    return addHeapObject(ret);
};

export function __wbg_clearTimeout_76877dbc010e786d(arg0) {
    const ret = clearTimeout(takeObject(arg0));
    return addHeapObject(ret);
};

export function __wbg_setTimeout_75cb9b6991a4031d() { return handleError(function (arg0, arg1) {
    const ret = setTimeout(getObject(arg0), arg1);
    return addHeapObject(ret);
}, arguments) };

export function __wbg_crypto_58f13aa23ffcb166(arg0) {
    const ret = getObject(arg0).crypto;
    return addHeapObject(ret);
};

export function __wbindgen_is_object(arg0) {
    const val = getObject(arg0);
    const ret = typeof(val) === 'object' && val !== null;
    return ret;
};

export function __wbg_process_5b786e71d465a513(arg0) {
    const ret = getObject(arg0).process;
    return addHeapObject(ret);
};

export function __wbg_versions_c2ab80650590b6a2(arg0) {
    const ret = getObject(arg0).versions;
    return addHeapObject(ret);
};

export function __wbg_node_523d7bd03ef69fba(arg0) {
    const ret = getObject(arg0).node;
    return addHeapObject(ret);
};

export function __wbindgen_is_string(arg0) {
    const ret = typeof(getObject(arg0)) === 'string';
    return ret;
};

export function __wbg_msCrypto_abcb1295e768d1f2(arg0) {
    const ret = getObject(arg0).msCrypto;
    return addHeapObject(ret);
};

export function __wbg_require_2784e593a4674877() { return handleError(function () {
    const ret = module.require;
    return addHeapObject(ret);
}, arguments) };

export function __wbindgen_is_function(arg0) {
    const ret = typeof(getObject(arg0)) === 'function';
    return ret;
};

export function __wbg_randomFillSync_a0d98aa11c81fe89() { return handleError(function (arg0, arg1) {
    getObject(arg0).randomFillSync(takeObject(arg1));
}, arguments) };

export function __wbg_getRandomValues_504510b5564925af() { return handleError(function (arg0, arg1) {
    getObject(arg0).getRandomValues(getObject(arg1));
}, arguments) };

export function __wbindgen_boolean_get(arg0) {
    const v = getObject(arg0);
    const ret = typeof(v) === 'boolean' ? (v ? 1 : 0) : 2;
    return ret;
};

export function __wbg_instanceof_Window_9029196b662bc42a(arg0) {
    let result;
    try {
        result = getObject(arg0) instanceof Window;
    } catch (_) {
        result = false;
    }
    const ret = result;
    return ret;
};

export function __wbg_setTimeout_eb1a0d116c26d9f6() { return handleError(function (arg0, arg1, arg2) {
    const ret = getObject(arg0).setTimeout(getObject(arg1), arg2);
    return ret;
}, arguments) };

export function __wbg_destination_9e793cf556243084(arg0) {
    const ret = getObject(arg0).destination;
    return addHeapObject(ret);
};

export function __wbg_currentTime_c6831b97750b898c(arg0) {
    const ret = getObject(arg0).currentTime;
    return ret;
};

export function __wbg_newwithcontextoptions_3fb88aa326cd01e0() { return handleError(function (arg0) {
    const ret = new lAudioContext(getObject(arg0));
    return addHeapObject(ret);
}, arguments) };

export function __wbg_close_51aa5539747ce076() { return handleError(function (arg0) {
    const ret = getObject(arg0).close();
    return addHeapObject(ret);
}, arguments) };

export function __wbg_createBuffer_13cd030d2b48e8fa() { return handleError(function (arg0, arg1, arg2, arg3) {
    const ret = getObject(arg0).createBuffer(arg1 >>> 0, arg2 >>> 0, arg3);
    return addHeapObject(ret);
}, arguments) };

export function __wbg_createBufferSource_58423f6345b5f559() { return handleError(function (arg0) {
    const ret = getObject(arg0).createBufferSource();
    return addHeapObject(ret);
}, arguments) };

export function __wbg_resume_9dc64ed7c3a65255() { return handleError(function (arg0) {
    const ret = getObject(arg0).resume();
    return addHeapObject(ret);
}, arguments) };

export function __wbindgen_string_get(arg0, arg1) {
    const obj = getObject(arg1);
    const ret = typeof(obj) === 'string' ? obj : undefined;
    var ptr1 = isLikeNone(ret) ? 0 : passStringToWasm0(ret, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    var len1 = WASM_VECTOR_LEN;
    getInt32Memory0()[arg0 / 4 + 1] = len1;
    getInt32Memory0()[arg0 / 4 + 0] = ptr1;
};

export function __wbg_copyToChannel_6e4bd2545a53db54() { return handleError(function (arg0, arg1, arg2, arg3) {
    getObject(arg0).copyToChannel(getArrayF32FromWasm0(arg1, arg2), arg3);
}, arguments) };

export function __wbg_setbuffer_beeece042e02534f(arg0, arg1) {
    getObject(arg0).buffer = getObject(arg1);
};

export function __wbg_setonended_83dd83b7f84cdef2(arg0, arg1) {
    getObject(arg0).onended = getObject(arg1);
};

export function __wbg_start_99ecc2647eb67ca6() { return handleError(function (arg0, arg1) {
    getObject(arg0).start(arg1);
}, arguments) };

export function __wbg_connect_3f8f5ba805800c62() { return handleError(function (arg0, arg1) {
    const ret = getObject(arg0).connect(getObject(arg1));
    return addHeapObject(ret);
}, arguments) };

export function __wbg_get_f01601b5a68d10e3(arg0, arg1) {
    const ret = getObject(arg0)[arg1 >>> 0];
    return addHeapObject(ret);
};

export function __wbg_length_1009b1af0c481d7b(arg0) {
    const ret = getObject(arg0).length;
    return ret;
};

export function __wbg_new_ffc6d4d085022169() {
    const ret = new Array();
    return addHeapObject(ret);
};

export function __wbg_newnoargs_c62ea9419c21fbac(arg0, arg1) {
    const ret = new Function(getStringFromWasm0(arg0, arg1));
    return addHeapObject(ret);
};

export function __wbg_get_7b48513de5dc5ea4() { return handleError(function (arg0, arg1) {
    const ret = Reflect.get(getObject(arg0), getObject(arg1));
    return addHeapObject(ret);
}, arguments) };

export function __wbg_call_90c26b09837aba1c() { return handleError(function (arg0, arg1) {
    const ret = getObject(arg0).call(getObject(arg1));
    return addHeapObject(ret);
}, arguments) };

export function __wbg_new_9fb8d994e1c0aaac() {
    const ret = new Object();
    return addHeapObject(ret);
};

export function __wbindgen_object_clone_ref(arg0) {
    const ret = getObject(arg0);
    return addHeapObject(ret);
};

export function __wbg_self_f0e34d89f33b99fd() { return handleError(function () {
    const ret = self.self;
    return addHeapObject(ret);
}, arguments) };

export function __wbg_window_d3b084224f4774d7() { return handleError(function () {
    const ret = window.window;
    return addHeapObject(ret);
}, arguments) };

export function __wbg_globalThis_9caa27ff917c6860() { return handleError(function () {
    const ret = globalThis.globalThis;
    return addHeapObject(ret);
}, arguments) };

export function __wbg_global_35dfdd59a4da3e74() { return handleError(function () {
    const ret = global.global;
    return addHeapObject(ret);
}, arguments) };

export function __wbindgen_is_undefined(arg0) {
    const ret = getObject(arg0) === undefined;
    return ret;
};

export function __wbg_eval_0b93354704a20351() { return handleError(function (arg0, arg1) {
    const ret = eval(getStringFromWasm0(arg0, arg1));
    return addHeapObject(ret);
}, arguments) };

export function __wbg_push_901f3914205d44de(arg0, arg1) {
    const ret = getObject(arg0).push(getObject(arg1));
    return ret;
};

export function __wbg_call_5da1969d7cd31ccd() { return handleError(function (arg0, arg1, arg2) {
    const ret = getObject(arg0).call(getObject(arg1), getObject(arg2));
    return addHeapObject(ret);
}, arguments) };

export function __wbg_name_0b0c238354bb6019(arg0) {
    const ret = getObject(arg0).name;
    return addHeapObject(ret);
};

export function __wbg_instanceof_Object_702c4990f4c3db8d(arg0) {
    let result;
    try {
        result = getObject(arg0) instanceof Object;
    } catch (_) {
        result = false;
    }
    const ret = result;
    return ret;
};

export function __wbg_constructor_2cc2b72dddc41594(arg0) {
    const ret = getObject(arg0).constructor;
    return addHeapObject(ret);
};

export function __wbg_new_60f57089c7563e81(arg0, arg1) {
    try {
        var state0 = {a: arg0, b: arg1};
        var cb0 = (arg0, arg1) => {
            const a = state0.a;
            state0.a = 0;
            try {
                return __wbg_adapter_176(a, state0.b, arg0, arg1);
            } finally {
                state0.a = a;
            }
        };
        const ret = new Promise(cb0);
        return addHeapObject(ret);
    } finally {
        state0.a = state0.b = 0;
    }
};

export function __wbg_resolve_6e1c6553a82f85b7(arg0) {
    const ret = Promise.resolve(getObject(arg0));
    return addHeapObject(ret);
};

export function __wbg_then_3ab08cd4fbb91ae9(arg0, arg1) {
    const ret = getObject(arg0).then(getObject(arg1));
    return addHeapObject(ret);
};

export function __wbg_buffer_a448f833075b71ba(arg0) {
    const ret = getObject(arg0).buffer;
    return addHeapObject(ret);
};

export function __wbg_newwithbyteoffsetandlength_d0482f893617af71(arg0, arg1, arg2) {
    const ret = new Uint8Array(getObject(arg0), arg1 >>> 0, arg2 >>> 0);
    return addHeapObject(ret);
};

export function __wbg_new_8f67e318f15d7254(arg0) {
    const ret = new Uint8Array(getObject(arg0));
    return addHeapObject(ret);
};

export function __wbg_set_2357bf09366ee480(arg0, arg1, arg2) {
    getObject(arg0).set(getObject(arg1), arg2 >>> 0);
};

export function __wbg_newwithlength_6c2df9e2f3028c43(arg0) {
    const ret = new Uint8Array(arg0 >>> 0);
    return addHeapObject(ret);
};

export function __wbg_subarray_2e940e41c0f5a1d9(arg0, arg1, arg2) {
    const ret = getObject(arg0).subarray(arg1 >>> 0, arg2 >>> 0);
    return addHeapObject(ret);
};

export function __wbg_set_759f75cd92b612d2() { return handleError(function (arg0, arg1, arg2) {
    const ret = Reflect.set(getObject(arg0), getObject(arg1), getObject(arg2));
    return ret;
}, arguments) };

export function __wbindgen_debug_string(arg0, arg1) {
    const ret = debugString(getObject(arg1));
    const ptr1 = passStringToWasm0(ret, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len1 = WASM_VECTOR_LEN;
    getInt32Memory0()[arg0 / 4 + 1] = len1;
    getInt32Memory0()[arg0 / 4 + 0] = ptr1;
};

export function __wbindgen_throw(arg0, arg1) {
    throw new Error(getStringFromWasm0(arg0, arg1));
};

export function __wbindgen_memory() {
    const ret = wasm.memory;
    return addHeapObject(ret);
};

export function __wbindgen_closure_wrapper1192(arg0, arg1, arg2) {
    const ret = makeMutClosure(arg0, arg1, 510, __wbg_adapter_32);
    return addHeapObject(ret);
};

export function __wbindgen_closure_wrapper1218(arg0, arg1, arg2) {
    const ret = makeMutClosure(arg0, arg1, 523, __wbg_adapter_35);
    return addHeapObject(ret);
};

export function __wbindgen_closure_wrapper1562(arg0, arg1, arg2) {
    const ret = makeMutClosure(arg0, arg1, 631, __wbg_adapter_38);
    return addHeapObject(ret);
};

