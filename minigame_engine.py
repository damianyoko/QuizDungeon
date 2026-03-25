import random
import time


class MinigameEngine:
    """
    Handles casino-style minigames with seedable RNG.
    Games: blackjack, roulette, dice_duel, high_low
    """

    def __init__(self, seed=None):
        self.rng = random.Random(seed or time.time())
        # Track ongoing blackjack session
        self._blackjack_state = None

    def _new_seed(self):
        """Reseed the RNG to prevent predictability."""
        self.rng.seed(time.time() * 1000)

    # ─────────────────────────────────────────────
    # BLACKJACK
    # ─────────────────────────────────────────────
    def _card_value(self, card):
        """Return the numeric value of a card (1-13 maps to blackjack values)."""
        # card is 1-13: Ace=1or11, 2-9=face value, 10/J/Q/K=10
        if card == 1:
            return 11  # Ace starts as 11, adjusted later
        elif card >= 10:
            return 10
        else:
            return card

    def _card_name(self, card):
        names = {1: "A", 11: "J", 12: "Q", 13: "K"}
        return names.get(card, str(card))

    def _hand_value(self, hand):
        """Calculate best blackjack hand value (handles aces)."""
        total = 0
        aces = 0
        for card in hand:
            if card == 1:
                aces += 1
                total += 11
            elif card >= 10:
                total += 10
            else:
                total += card
        # Reduce aces from 11 to 1 if bust
        while total > 21 and aces > 0:
            total -= 10
            aces -= 1
        return total

    def _draw_card(self):
        """Draw a random card (1-13)."""
        return self.rng.randint(1, 13)

    def _format_hand(self, hand):
        return [self._card_name(c) for c in hand]

    def blackjack(self, bet, action, state=None):
        """
        Play a blackjack hand.
        action: "deal" to start, "hit" to draw, "stand" to end
        state: existing hand state (player_hand, dealer_hand) for ongoing games
        Returns: {
            player_hand, dealer_hand, player_value, dealer_value,
            result ("win"|"lose"|"bust"|"push"|"blackjack"|"playing"),
            points_delta, message, game_over
        }
        """
        self._new_seed()

        if action == "deal" or state is None:
            # New hand
            player_hand = [self._draw_card(), self._draw_card()]
            dealer_hand = [self._draw_card(), self._draw_card()]
            player_value = self._hand_value(player_hand)
            dealer_value = self._hand_value(dealer_hand)

            # Check for blackjack
            if player_value == 21:
                # Dealer also check
                if dealer_value == 21:
                    return {
                        "player_hand": self._format_hand(player_hand),
                        "dealer_hand": self._format_hand(dealer_hand),
                        "player_value": player_value,
                        "dealer_value": dealer_value,
                        "result": "push",
                        "points_delta": 0,
                        "message": "Both have Blackjack! Push — bet returned.",
                        "game_over": True,
                    }
                return {
                    "player_hand": self._format_hand(player_hand),
                    "dealer_hand": self._format_hand(dealer_hand),
                    "player_value": player_value,
                    "dealer_value": dealer_value,
                    "result": "blackjack",
                    "points_delta": int(bet * 1.5),
                    "message": f"🃏 Blackjack! You win {int(bet * 1.5)} points!",
                    "game_over": True,
                }

            return {
                "player_hand": self._format_hand(player_hand),
                "dealer_hand": [self._card_name(dealer_hand[0]), "?"],
                "player_value": player_value,
                "dealer_value": self._card_value(dealer_hand[0]),
                "result": "playing",
                "points_delta": 0,
                "message": "Hit or Stand?",
                "game_over": False,
                "_dealer_hand_raw": self._format_hand(dealer_hand),
                "_state": {
                    "player_hand_raw": player_hand,
                    "dealer_hand_raw": dealer_hand,
                },
            }

        elif action == "hit":
            if state is None:
                return {"error": "No active game"}
            player_hand = state["player_hand_raw"]
            dealer_hand = state["dealer_hand_raw"]
            player_hand.append(self._draw_card())
            player_value = self._hand_value(player_hand)

            if player_value > 21:
                return {
                    "player_hand": self._format_hand(player_hand),
                    "dealer_hand": self._format_hand(dealer_hand),
                    "player_value": player_value,
                    "dealer_value": self._hand_value(dealer_hand),
                    "result": "bust",
                    "points_delta": -bet,
                    "message": f"💥 Bust! You went over 21. Lost {bet} points.",
                    "game_over": True,
                }
            elif player_value == 21:
                # Auto-stand at 21, resolve
                return self.blackjack(bet, "stand", state={
                    "player_hand_raw": player_hand,
                    "dealer_hand_raw": dealer_hand,
                })
            else:
                return {
                    "player_hand": self._format_hand(player_hand),
                    "dealer_hand": [self._card_name(dealer_hand[0]), "?"],
                    "player_value": player_value,
                    "dealer_value": self._card_value(dealer_hand[0]),
                    "result": "playing",
                    "points_delta": 0,
                    "message": f"You have {player_value}. Hit or Stand?",
                    "game_over": False,
                    "_state": {
                        "player_hand_raw": player_hand,
                        "dealer_hand_raw": dealer_hand,
                    },
                }

        elif action == "stand":
            if state is None:
                return {"error": "No active game"}
            player_hand = state["player_hand_raw"]
            dealer_hand = state["dealer_hand_raw"]
            player_value = self._hand_value(player_hand)

            # Dealer plays: hits until 17+
            while self._hand_value(dealer_hand) < 17:
                dealer_hand.append(self._draw_card())

            dealer_value = self._hand_value(dealer_hand)

            if dealer_value > 21:
                result = "win"
                points_delta = bet
                message = f"🎉 Dealer busts! You win {bet} points!"
            elif player_value > dealer_value:
                result = "win"
                points_delta = bet
                message = f"🎉 You win! {player_value} vs {dealer_value}. +{bet} points!"
            elif dealer_value > player_value:
                result = "lose"
                points_delta = -bet
                message = f"😞 Dealer wins. {dealer_value} vs {player_value}. -{bet} points."
            else:
                result = "push"
                points_delta = 0
                message = f"🤝 Push! Both have {player_value}. Bet returned."

            return {
                "player_hand": self._format_hand(player_hand),
                "dealer_hand": self._format_hand(dealer_hand),
                "player_value": player_value,
                "dealer_value": dealer_value,
                "result": result,
                "points_delta": points_delta,
                "message": message,
                "game_over": True,
            }

        return {"error": f"Unknown action: {action}"}

    # ─────────────────────────────────────────────
    # ROULETTE
    # ─────────────────────────────────────────────
    RED_NUMBERS = {1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36}

    def _eval_bet(self, bet_type_lower, spin, color):
        """Evaluate a single bet type against the spin result. Returns (win, payout_mult) or None on error."""
        if bet_type_lower == "red":
            return color == "red", 1
        elif bet_type_lower == "black":
            return color == "black", 1
        elif bet_type_lower == "even":
            return spin != 0 and spin % 2 == 0, 1
        elif bet_type_lower == "odd":
            return spin != 0 and spin % 2 == 1, 1
        elif bet_type_lower.isdigit():
            return spin == int(bet_type_lower), 35
        return None, None

    def roulette(self, bet, bet_type=None, bet_types=None):
        """
        Spin the roulette wheel (0-36).
        bet_type: single bet (legacy) "red"|"black"|"even"|"odd"|number
        bet_types: list of bets — each costs `bet` points, wins/losses calculated independently.
        Returns: {spin, result, points_delta, message}
        """
        self._new_seed()
        spin = self.rng.randint(0, 36)
        color = "green" if spin == 0 else ("red" if spin in self.RED_NUMBERS else "black")
        color_emoji = {"red": "🔴", "black": "⚫", "green": "🟢"}.get(color, "")

        # Support both single and multiple bets
        bets = bet_types if bet_types else ([bet_type] if bet_type else [])
        bets = [str(b).lower().strip() for b in bets]

        if not bets:
            return {"error": "No bet specified"}

        total_delta = 0
        winners = []
        losers = []

        for bt in bets:
            win, payout_mult = self._eval_bet(bt, spin, color)
            if win is None:
                continue
            if win:
                total_delta += int(bet * payout_mult)
                winners.append(bt)
            else:
                total_delta -= bet
                losers.append(bt)

        overall_win = total_delta > 0

        if len(bets) == 1:
            # Single bet message (original behaviour)
            if overall_win:
                message = f"{color_emoji} Landed on {spin}! You win {abs(total_delta)} points!"
            else:
                message = f"{color_emoji} Landed on {spin}. You lose {bet} points."
        else:
            # Multi-bet message
            won_str = ", ".join(winners) if winners else "none"
            msg_parts = [f"{color_emoji} Landed on {spin}!"]
            if winners:
                msg_parts.append(f"Won: {won_str}.")
            if losers:
                msg_parts.append(f"Lost: {', '.join(losers)}.")
            net = f"+{total_delta}" if total_delta >= 0 else str(total_delta)
            msg_parts.append(f"Net: {net} pts.")
            message = " ".join(msg_parts)

        return {
            "spin": spin,
            "color": color,
            "result": "win" if overall_win else "lose",
            "points_delta": total_delta,
            "message": message,
            "bet_types": bets,
        }

    # ─────────────────────────────────────────────
    # DICE DUEL
    # ─────────────────────────────────────────────
    def dice_duel(self, bet, double_or_nothing=False):
        """
        Roll 2d6 each (player and dealer). Higher total wins.
        double_or_nothing: if True and already won once, doubles the stakes.
        Returns: {player_roll, dealer_roll, result, points_delta, message}
        """
        self._new_seed()
        player_dice = [self.rng.randint(1, 6), self.rng.randint(1, 6)]
        dealer_dice = [self.rng.randint(1, 6), self.rng.randint(1, 6)]
        player_total = sum(player_dice)
        dealer_total = sum(dealer_dice)

        effective_bet = bet * 2 if double_or_nothing else bet

        if player_total > dealer_total:
            result = "win"
            points_delta = effective_bet
            message = f"🎲 You rolled {player_total} ({player_dice[0]}+{player_dice[1]}) vs dealer's {dealer_total}. Win {effective_bet} points!"
        elif dealer_total > player_total:
            result = "lose"
            points_delta = -effective_bet
            message = f"🎲 You rolled {player_total} ({player_dice[0]}+{player_dice[1]}) vs dealer's {dealer_total}. Lose {effective_bet} points."
        else:
            result = "tie"
            points_delta = 0
            message = f"🎲 Both rolled {player_total}! It's a tie — bet returned."

        return {
            "player_dice": player_dice,
            "dealer_dice": dealer_dice,
            "player_total": player_total,
            "dealer_total": dealer_total,
            "result": result,
            "points_delta": points_delta,
            "message": message,
            "double_or_nothing": double_or_nothing,
        }

    # ─────────────────────────────────────────────
    # HIGH / LOW
    # ─────────────────────────────────────────────
    def high_low(self, bet, guess, current_card=None, streak=0):
        """
        Guess if the next card (1-13) is higher or lower than current_card.
        guess: "high" | "low"
        current_card: int 1-13 (if None, draws a starting card)
        streak: current win streak (affects multiplier)
        Returns: {current_card, next_card, result, points_delta, message, new_streak}
        """
        self._new_seed()

        if current_card is None:
            current_card = self.rng.randint(1, 13)
            return {
                "current_card": current_card,
                "card_name": self._card_name(current_card),
                "message": f"Starting card: {self._card_name(current_card)}. Guess High or Low?",
                "game_over": False,
                "starting": True,
            }

        next_card = self.rng.randint(1, 13)
        next_name = self._card_name(next_card)
        current_name = self._card_name(current_card)

        guess_lower = guess.lower().strip()

        if next_card == current_card:
            # Tie — push
            result = "push"
            points_delta = 0
            new_streak = streak
            message = f"Card was {next_name} — same as {current_name}! Push. Bet returned."
        elif (guess_lower == "high" and next_card > current_card) or (
            guess_lower == "low" and next_card < current_card
        ):
            result = "win"
            streak_mult = 1 + (streak * 0.5)  # +50% per streak level
            points_delta = int(bet * streak_mult)
            new_streak = streak + 1
            message = f"🃏 {next_name}! Correct! ×{streak_mult:.1f} multiplier → +{points_delta} points! Streak: {new_streak}"
        else:
            result = "lose"
            points_delta = -bet
            new_streak = 0
            message = f"🃏 {next_name}. Wrong guess. Lost {bet} points."

        return {
            "current_card": current_card,
            "current_card_name": current_name,
            "next_card": next_card,
            "next_card_name": next_name,
            "guess": guess,
            "result": result,
            "points_delta": points_delta,
            "new_streak": new_streak,
            "message": message,
            "game_over": result == "lose",
        }
