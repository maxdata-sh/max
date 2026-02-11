if [[ -n "$BASH_VERSION" ]]; then
  major=${BASH_VERSION%%.*}
  if (( major < 4 )); then
    echo "max: bash completion requires bash >= 4 (you are using $BASH_VERSION)" >&2
    echo "     Use zsh (recommended) or upgrade bash via Homebrew:" >&2
    echo "       brew install bash" >&2
    return 1 2>/dev/null || exit 1
  fi
fi

_max_completions() {
    COMPREPLY=()

    # Prevent operator splitting
    local COMP_WORDBREAKS=${COMP_WORDBREAKS//=/}
    COMP_WORDBREAKS=${COMP_WORDBREAKS//</}
    COMP_WORDBREAKS=${COMP_WORDBREAKS//>/}
    COMP_WORDBREAKS=${COMP_WORDBREAKS//!/}
    COMP_WORDBREAKS=${COMP_WORDBREAKS//~/}
    COMP_WORDBREAKS=${COMP_WORDBREAKS//|/}
    COMP_WORDBREAKS=${COMP_WORDBREAKS//&/}
    COMP_WORDBREAKS=${COMP_WORDBREAKS//(/}
    COMP_WORDBREAKS=${COMP_WORDBREAKS//)/}

    local cur prev
    cur="${COMP_WORDS[COMP_CWORD]}"
    prev="${COMP_WORDS[COMP_CWORD-1]}"

    local argv=("${COMP_WORDS[@]:1:COMP_CWORD}")

    local completions
    completions=$(max __complete "${argv[@]}" 2>/dev/null) || return

    if [[ "$prev" == "--filter" && "$cur" != \"* ]]; then
        compopt -o nospace 2>/dev/null

        COMPREPLY=()
        while read -r c; do
            COMPREPLY+=( "\"$c " )
        done <<< "$completions"
        return
    fi

    COMPREPLY=( $(compgen -W "$completions" -- "$cur") )
}

complete -F _max_completions max
