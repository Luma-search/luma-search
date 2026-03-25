/**
 * Luma Autocomplete – Core: State Store
 * Inspiriert vom Algolia createStore Pattern aus createAutocomplete.ts.
 *
 * Ein Observable State-Container:
 *   - getState()      → aktueller State (read-only)
 *   - dispatch(action) → State-Transition via Reducer, ruft onChange auf
 */

/**
 * @template S - State-Typ
 * @template A - Action-Typ
 * @param {function(S, A): S} reducer - Reiner Reducer: (state, action) => newState
 * @param {S} initialState
 * @param {function({ prevState: S, state: S }): void} onChange - Callback nach State-Änderung
 * @returns {{ getState: function(): S, dispatch: function(A): void }}
 */
export function createStore(reducer, initialState, onChange) {
    let state = initialState;

    function getState() {
        return state;
    }

    function dispatch(action) {
        const prevState = state;
        state = reducer(state, action);
        onChange({ prevState, state });
    }

    return { getState, dispatch };
}
