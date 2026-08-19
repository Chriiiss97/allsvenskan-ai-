/**
 * All UI- och systemprompt-text på ett ställe.
 *
 * Idén: appen är svensk i v1, men genom att hålla texten samlad här
 * (istället för utspridd som strängar i komponenter/routes) blir det
 * enkelt att lägga till fler språk senare — t.ex. genom att lägga till
 * en `en.ts` med samma form och växla på locale. Inget att bygga nu,
 * bara en vana från start (se PROJEKT_BRIEF.md, avsnitt "Språk").
 */
export const strings = {
  app: {
    name: "Allsvenskan-chattbot",
    tagline: "Chatta med Allsvenskan-statistik",
  },
  auth: {
    loginWithGoogle: "Logga in med Google",
    logout: "Logga ut",
    loggedInAs: "Inloggad som",
    loginRequired: "Du måste logga in för att fortsätta.",
    loginError: "Något gick fel vid inloggningen. Försök igen.",
  },
  home: {
    welcomeTitle: "Välkommen till Allsvenskan-chattbot",
    welcomeBody:
      "Fråga om mål, assist, kort och matcher för dina lag — snart direkt i chatten.",
    liveComingSoon:
      "Live-matchchatt är på väg — under tiden kan du fråga om historisk statistik.",
    buildingNotice:
      "Sidan är under uppbyggnad. Just nu testar vi inloggning och databasgrund.",
  },
  errors: {
    generic: "Tekniskt fel just nu, testa igen om en stund.",
    outOfScope:
      "Haha, det är utanför min comfort zone! Men fråga mig gärna om AIK:s målskyttar eller IFK:s senaste resultat 😄",
    dontKnowYet: "Jag har inte den informationen än, men jobbar på det.",
    quotaExceeded: "Du har använt din gratiskvot för idag. Kom tillbaka imorgon!",
  },
} as const;
