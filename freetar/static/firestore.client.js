// freetar/static/firestore.client.js

;(() => {
    if (!window.firebase) {
        console.error('Firebase SDK not loaded before firestore.client.js')
        return
    }

    // 1. Firebase configuration
    // Replace these placeholders with your real config from the Firebase console
    const firebaseConfig = {
        apiKey: 'YOUR_API_KEY',
        authDomain: 'YOUR_PROJECT_ID.firebaseapp.com',
        projectId: 'YOUR_PROJECT_ID',
        storageBucket: 'YOUR_PROJECT_ID.appspot.com',
        messagingSenderId: 'YOUR_SENDER_ID',
        appId: 'YOUR_APP_ID'
    }

    // 2. Initialize app once
    let app
    if (firebase.apps?.length) {
        app = firebase.app()
    } else {
        app = firebase.initializeApp(firebaseConfig)
    }

    const auth = firebase.auth()
    const db = firebase.firestore()

    // Optional Firestore settings if you want
    // db.settings({ ignoreUndefinedProperties: true })

    // 3. Path helpers

    function libraryDocRef(uid) {
        // Single doc per user that holds the whole My Chords library JSON
        return db
            .collection('users')
            .doc(uid)
            .collection('library')
            .doc('main')
    }

    // 4. Auth helpers

    async function signInWithGoogle() {
        const provider = new firebase.auth.GoogleAuthProvider()
        const result = await auth.signInWithPopup(provider)
        return result.user
    }

    async function signOut() {
        await auth.signOut()
    }

    function onAuthStateChanged(callback) {
        // callback gets either null or a Firebase user
        return auth.onAuthStateChanged(callback)
    }

    // 5. Library CRUD helpers

    /**
     * Load the current user's full library JSON
     * Returns null if no library exists yet
     */
    async function loadLibrary(uid) {
        const ref = libraryDocRef(uid)
        const snap = await ref.get()
        if (!snap.exists) return null

        const data = snap.data()
        // Expect shape { libraryJson: <your existing JSON>, updatedAt: <timestamp> }
        return data.libraryJson || null
    }

    /**
     * Save the full library JSON for the current user
     * Expects the same object you currently send to Flask (buildDataFromDOM output)
     */
    async function saveLibrary(uid, libraryJson) {
        const ref = libraryDocRef(uid)
        await ref.set(
            {
                libraryJson,
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            },
            { merge: true }
        )
    }

    /**
     * Convenience helper
     * If no library exists yet, initializes an empty one via the provided factory
     */
    async function loadOrCreateLibrary(uid, emptyLibraryFactory) {
        const existing = await loadLibrary(uid)
        if (existing) return existing

        const emptyLib =
            typeof emptyLibraryFactory === 'function'
                ? emptyLibraryFactory()
                : emptyLibraryFactory || {}

        await saveLibrary(uid, emptyLib)
        return emptyLib
    }

    // 6. Expose a small global API for the rest of your code

    window.freetarData = {
        app,
        auth,
        db,
        signInWithGoogle,
        signOut,
        onAuthStateChanged,
        loadLibrary,
        saveLibrary,
        loadOrCreateLibrary
    }
})()
