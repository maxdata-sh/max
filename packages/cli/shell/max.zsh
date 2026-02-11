_max() {
    local -a argv completions
    local cur prev

    cur="${words[CURRENT]}"
    prev="${words[CURRENT-1]}"

    # Pass all words after the command to the CLI (zsh arrays are 1-indexed)
    argv=("${(@)words[2,-1]}")

    # Get completions from CLI
    completions=("${(@f)$(max __complete "${argv[@]}" 2>/dev/null)}")

    # Filter out empty completions
    completions=("${(@)completions:#}")

    # If completing a --filter value
    if [[ "$prev" == "--filter" ]]; then
        if [[ "$cur" == \"* ]]; then
            local -a escaped
            local c
            for c in "${completions[@]}"; do
                c="${c//\\/\\\\}"
                c="${c//\"/\\\"}"
                escaped+=("$c")
            done
            compadd -Q -S "" -- "${escaped[@]}"
        elif [[ "$cur" == \'* ]]; then
            local -a escaped
            local c
            for c in "${completions[@]}"; do
                c="${c//\'/\'\\\'\'}"
                escaped+=("$c")
            done
            compadd -Q -S "" -- "${escaped[@]}"
        else
            compadd -Q -S "" -P "'" -- "${completions[@]}"
        fi
    else
        compadd -- "${completions[@]}"
    fi
}

compdef _max max
