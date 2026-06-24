#!/usr/bin/env python3
"""Dice roller for the Sayola campaign. True randomness, no DM thumb on the scale."""
import sys, random, secrets

# Use secrets for cryptographically-strong entropy so rolls aren't seedable/predictable
def roll_die(sides):
    return secrets.randbelow(sides) + 1

def main():
    # Usage: roll.py <NdX> [modifier] [adv|dis] ["label"]
    # Examples: roll.py 1d20 5 adv "Stealth check"
    #           roll.py 2d6
    args = sys.argv[1:]
    if not args:
        print("usage: roll.py NdX [mod] [adv|dis] [label]")
        return

    notation = args[0].lower()
    n, sides = notation.split('d')
    n = int(n); sides = int(sides)

    mod = 0
    mode = None
    label = ""
    for a in args[1:]:
        if a in ("adv", "dis"):
            mode = a
        elif a.lstrip('+-').isdigit():
            mod = int(a)
        else:
            label = a

    if mode and notation == "1d20":
        a, b = roll_die(20), roll_die(20)
        nat = max(a, b) if mode == "adv" else min(a, b)
        rolls = [a, b]
        detail = f"({mode}: {a},{b} -> {nat})"
    else:
        rolls = [roll_die(sides) for _ in range(n)]
        nat = sum(rolls)
        detail = f"rolls={rolls}" if n > 1 else f"nat={nat}"

    total = nat + mod
    crit = ""
    if notation == "1d20":
        if nat == 20: crit = " *** NAT 20 ***"
        elif nat == 1: crit = " *** NAT 1 ***"

    lbl = f"[{label}] " if label else ""
    modstr = f" {'+' if mod>=0 else ''}{mod}" if mod else ""
    print(f"{lbl}{notation}{modstr}: {detail}{modstr} = {total}{crit}")

if __name__ == "__main__":
    main()
