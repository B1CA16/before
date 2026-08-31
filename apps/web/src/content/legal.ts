/**
 * The legal pages, as data.
 *
 * Three things drove this shape.
 *
 * Long prose does not belong in `messages/*.json`. That catalogue is shipped to the browser for every
 * page; a privacy policy is several thousand words that only two routes ever render, and both of them
 * are server components. Keeping it here means it is compiled into the server render and never
 * reaches a client bundle.
 *
 * Structure rather than a blob of HTML, because the required disclosures are genuinely tabular
 * ("what, why, on what legal basis") and because a typed shape makes it possible to assert that the
 * two languages have not drifted apart, the same discipline the message catalogues get.
 *
 * The text is written against the schema, not from a template. Every claim in it was checked against
 * the live database, the migrations, the auth flow and the deploy config while it was written. A
 * generated policy that misdescribes what is stored is worse than a short honest one, and the audit
 * that produced this found the plan's own assumption ("email and sessions, nothing else") to be
 * wrong: Google was also handing over a name and a picture URL.
 */

import type { Locale } from "@/i18n/routing";

/** One paragraph, one bulleted list, or one table. Enough for a legal page and no more. */
export type Block =
  | { p: string }
  | { list: string[] }
  | { table: { head: string[]; rows: string[][] } };

export type Section = {
  /** Stable anchor, so a specific clause can be linked to. Identical across locales on purpose. */
  id: string;
  heading: string;
  blocks: Block[];
};

export type LegalDoc = {
  title: string;
  /** The honest one-paragraph version, for people who will not read the rest. */
  summary: string;
  sections: Section[];
};

/**
 * Published contact point. One constant, because it appears in both documents in both languages and
 * a stale address in a legal page is a broken obligation rather than a typo.
 */
export const CONTACT_EMAIL = "francisco.dinis.ferreira@gmail.com";

/** The controller, in the GDPR sense: the person who decides why this data is held. */
export const CONTROLLER = "Francisco Ferreira";

/**
 * Last substantive change, ISO so it can be formatted per locale. Update this whenever the meaning
 * changes, not when wording is tidied.
 */
export const LEGAL_UPDATED = "2026-08-31";

export type LegalKey = "privacy" | "terms";

/** Both documents, both languages. */
export const LEGAL: Record<LegalKey, Record<Locale, LegalDoc>> = {
  privacy: {
    en: {
      title: "Privacy",
      summary:
        "BeFORE stores your email address and the surf sessions you log. That is the whole list. " +
        "Your sessions are visible only to you, there is no advertising and no tracking, and " +
        "deleting your account erases everything straight away.",
      sections: [
        {
          id: "who",
          heading: "Who is responsible",
          blocks: [
            {
              p:
                `BeFORE is a personal project run by ${CONTROLLER} in Portugal. It is not a company. ` +
                "In the language of the GDPR, that makes him the data controller for everything " +
                "described here.",
            },
            { p: `Questions, requests or complaints: ${CONTACT_EMAIL}.` },
          ],
        },
        {
          id: "what",
          heading: "What is stored, and why",
          blocks: [
            {
              table: {
                head: ["What", "Why", "Legal basis"],
                rows: [
                  [
                    "Your email address, an internal account identifier, and the times your account was created and last signed in",
                    "So that an account exists to own your ratings, and so you can sign back in to reach them",
                    "Performance of a contract (Art. 6(1)(b)): you asked for an account",
                  ],
                  [
                    "Each session you log: which spot, the date and hour, your rating from 1 to 5, any tags you picked from the fixed list, and your optional note",
                    "To show you your own log, and to train the model that scores surf conditions. Teaching that model is what the ratings are for",
                    "Performance of a contract (Art. 6(1)(b))",
                  ],
                  [
                    "Ordinary web server logs kept by the companies that host this site, which include IP addresses",
                    "To keep the service running and to deal with abuse",
                    "Legitimate interests (Art. 6(1)(f))",
                  ],
                ],
              },
            },
            {
              p:
                "There is no other category. No location history, no device fingerprint, no contact " +
                "list, no payment details, and no advertising identifiers.",
            },
          ],
        },
        {
          id: "source",
          heading: "Where it comes from",
          blocks: [
            {
              p:
                "Signing in happens through Google, and BeFORE asks Google for one thing: your email " +
                "address. It does not receive your name, your profile picture, your contacts or your " +
                "password. Google never shares your password with any site.",
            },
            { p: "Everything else is what you typed when you logged a session." },
          ],
        },
        {
          id: "not",
          heading: "What does not happen",
          blocks: [
            {
              list: [
                "Your data is never sold, rented or shared for anyone's marketing.",
                "There is no advertising on BeFORE and no ad network embedded in it.",
                "There is no tracking cookie. Visits are counted with Vercel Web Analytics, which sets no cookie and builds no profile: it records that a page was viewed, roughly where from and on what kind of device, and nothing that identifies you or links one visit to the next.",
                "Nothing about you is profiled, and no automated decision is made about you.",
                "Your logged sessions are never shown to other users as yours.",
              ],
            },
          ],
        },
        {
          id: "device",
          heading: "What is kept on your device",
          blocks: [
            {
              p:
                "When you sign in, the app stores your login in your browser's local storage so that " +
                "you stay signed in between visits. It is not a cookie and it is not used to follow " +
                "you anywhere. Signing out removes it, and so does clearing your browser data. The " +
                "same storage also remembers that you closed the short introduction, so it is not " +
                "shown to you again. That is a single yes-or-no flag and nothing more.",
            },
            {
              p:
                "There is one cookie, called NEXT_LOCALE. It holds nothing but a language code, " +
                "\"pt\" or \"en\", so the site opens in the language you last used. It is set on your " +
                "first visit, it identifies nobody, and it is not shared with anyone. Under the " +
                "ePrivacy rules a cookie that only makes the site work as you asked needs no consent " +
                "banner, which is why you are not being shown one.",
            },
          ],
        },
        {
          id: "who-else",
          heading: "Who else handles it",
          blocks: [
            {
              p:
                "Running a site means using other companies' computers. These are the only ones " +
                "involved, and what each one sees:",
            },
            {
              table: {
                head: ["Who", "What for", "Where"],
                rows: [
                  ["Supabase", "The database and the sign-in system", "Ireland (EU)"],
                  ["Render", "The API that calculates and serves the scores", "Frankfurt (EU)"],
                  [
                    "Vercel",
                    "Hosting and delivering the website itself, and counting visits without cookies",
                    "Global edge network",
                  ],
                  [
                    "Google",
                    "The sign-in itself. Google decides for itself what it records about your use of your Google account",
                    "Google's own infrastructure",
                  ],
                  [
                    "CARTO",
                    "The map images. Your browser fetches them directly, so CARTO receives your IP address. This happens whether or not you have an account",
                    "CARTO's own infrastructure",
                  ],
                ],
              },
            },
            {
              p:
                "Supabase, Render and Vercel act on instruction and do nothing else with your data. " +
                "Google and CARTO are their own controllers for what they collect on their side, " +
                "under their own privacy policies.",
            },
          ],
        },
        {
          id: "transfers",
          heading: "Leaving the EU",
          blocks: [
            {
              p:
                "The database and the API are both inside the EU: Ireland and Frankfurt respectively. " +
                "Vercel, Google and CARTO are US companies, so some data (server logs above all) may " +
                "be handled outside the EU under the safeguards set out in their own terms.",
            },
          ],
        },
        {
          id: "keep",
          heading: "How long it is kept",
          blocks: [
            {
              list: [
                "Sessions: until you delete them, or until you delete your account.",
                "Your account: until you delete it. There is no automatic expiry.",
                "Server logs: for the short retention periods the hosting companies apply, which are their policies rather than ours.",
              ],
            },
            {
              p:
                "Deleting your account takes effect immediately and removes every session with it. " +
                "That is enforced by the database itself rather than by code that could forget to " +
                "run.",
            },
            {
              p:
                "One honest limitation about the model. At the time of writing no model has been " +
                "trained on anyone's ratings. Once one has been, deleting your account removes your " +
                "ratings from any future training, but a model that was already trained cannot " +
                "un-learn what it learned. It holds general patterns about surf conditions, not your " +
                "individual sessions.",
            },
          ],
        },
        {
          id: "rights",
          heading: "Your rights",
          blocks: [
            {
              p:
                "Under the GDPR you can ask for a copy of your data, correct it, delete it, restrict " +
                "or object to how it is used, and receive it in a portable form.",
            },
            {
              p:
                "Deletion needs no request: open your account in the app and choose to delete it. It " +
                "is immediate and total. For anything else, email " +
                `${CONTACT_EMAIL} and you will get an answer within one month.`,
            },
            {
              p:
                "If you are not satisfied, you can complain to the Portuguese supervisory authority, " +
                "the Comissão Nacional de Proteção de Dados (CNPD), or to the " +
                "authority where you live.",
            },
          ],
        },
        {
          id: "security",
          heading: "Security",
          blocks: [
            {
              p:
                "All traffic uses HTTPS. Your identity is proved to the API on every single request " +
                "by a signed token that the API verifies against Google's and Supabase's public " +
                "keys, and every query for sessions is filtered to the account that asked. No system " +
                "is perfectly secure, and this one is run by one person, which is worth knowing when " +
                "you decide what to write in a note.",
            },
          ],
        },
        {
          id: "children",
          heading: "Children",
          blocks: [
            {
              p:
                "BeFORE is not intended for children under 16 and their data is not knowingly " +
                "collected. If you believe a child has created an account, email " +
                `${CONTACT_EMAIL} and it will be removed.`,
            },
          ],
        },
        {
          id: "changes",
          heading: "Changes to this page",
          blocks: [
            {
              p:
                "The date at the top changes whenever the meaning does. If a change actually affects " +
                "what is collected or why, it will be announced in the app rather than quietly " +
                "edited in.",
            },
          ],
        },
      ],
    },
    pt: {
      title: "Privacidade",
      summary:
        "O BeFORE guarda o seu endereço de email e as sessões de surf que registar. É " +
        "essa a lista completa. As suas sessões só são visíveis para si, não " +
        "há publicidade nem rastreio, e apagar a conta elimina tudo de imediato.",
      sections: [
        {
          id: "who",
          heading: "Quem é o responsável",
          blocks: [
            {
              p:
                `O BeFORE é um projeto pessoal mantido por ${CONTROLLER}, em Portugal. Não ` +
                "é uma empresa. Na linguagem do RGPD, isso faz dele o responsável pelo " +
                "tratamento de tudo o que aqui se descreve.",
            },
            { p: `Dúvidas, pedidos ou reclamações: ${CONTACT_EMAIL}.` },
          ],
        },
        {
          id: "what",
          heading: "O que é guardado, e porquê",
          blocks: [
            {
              table: {
                head: ["O que", "Porquê", "Fundamento legal"],
                rows: [
                  [
                    "O seu endereço de email, um identificador interno de conta, e as datas em que a conta foi criada e usada pela última vez",
                    "Para existir uma conta a que pertençam as suas avaliações, e para poder voltar a entrar e chegar a elas",
                    "Execução de um contrato (art. 6.º, n.º 1, al. b)): pediu uma conta",
                  ],
                  [
                    "Cada sessão que regista: que spot, a data e a hora, a sua avaliação de 1 a 5, as etiquetas que escolher da lista fixa, e a nota opcional",
                    "Para lhe mostrar o seu próprio registo, e para treinar o modelo que pontua as condições. Ensinar esse modelo é a razão de ser das avaliações",
                    "Execução de um contrato (art. 6.º, n.º 1, al. b))",
                  ],
                  [
                    "Registos normais de servidor mantidos pelas empresas que alojam o site, que incluem endereços IP",
                    "Para manter o serviço a funcionar e lidar com abusos",
                    "Interesse legítimo (art. 6.º, n.º 1, al. f))",
                  ],
                ],
              },
            },
            {
              p:
                "Não há mais nenhuma categoria. Sem histórico de localização, " +
                "sem impressão digital do dispositivo, sem lista de contactos, sem dados de " +
                "pagamento e sem identificadores publicitários.",
            },
          ],
        },
        {
          id: "source",
          heading: "De onde vêm",
          blocks: [
            {
              p:
                "A autenticação é feita através da Google, e o BeFORE pede à " +
                "Google uma única coisa: o seu endereço de email. Não recebe o seu " +
                "nome, a sua fotografia, os seus contactos nem a sua palavra-passe. A Google nunca " +
                "partilha a sua palavra-passe com nenhum site.",
            },
            { p: "Tudo o resto foi escrito por si ao registar uma sessão." },
          ],
        },
        {
          id: "not",
          heading: "O que não acontece",
          blocks: [
            {
              list: [
                "Os seus dados nunca são vendidos, alugados ou partilhados para marketing de quem quer que seja.",
                "Não há publicidade no BeFORE nem qualquer rede de anúncios incorporada.",
                "Não há cookie de rastreio. As visitas são contadas com o Vercel Web Analytics, que não coloca cookies nem constrói perfis: regista que uma página foi vista, mais ou menos de onde e em que tipo de dispositivo, e nada que te identifique ou que ligue uma visita à seguinte.",
                "Não é feita qualquer definição de perfis nem qualquer decisão automatizada sobre si.",
                "As sessões que regista nunca são mostradas a outros utilizadores como sendo suas.",
              ],
            },
          ],
        },
        {
          id: "device",
          heading: "O que fica no seu dispositivo",
          blocks: [
            {
              p:
                "Quando entra na conta, a aplicação guarda a sua sessão de login no " +
                "armazenamento local do navegador, para que continue autenticado entre visitas. " +
                "Não é um cookie e não serve para o seguir seja onde for. Sair da " +
                "conta remove-a, tal como limpar os dados do navegador. O mesmo armazenamento " +
                "guarda também que fechou a breve introdução, para não lhe voltar a ser mostrada. " +
                "É apenas uma marca de sim ou não, e mais nada.",
            },
            {
              p:
                "Existe um cookie, chamado NEXT_LOCALE. Guarda apenas um código de idioma, " +
                "\"pt\" ou \"en\", para que o site abra na língua que usou da última vez. " +
                "É colocado na primeira visita, não identifica ninguém e não é " +
                "partilhado com quem quer que seja. Ao abrigo das regras da privacidade nas " +
                "comunicações electrónicas, um cookie que serve apenas para o site funcionar " +
                "como pediu não exige consentimento, e é por isso que não lhe " +
                "aparece nenhum aviso.",
            },
          ],
        },
        {
          id: "who-else",
          heading: "Quem mais lhe acede",
          blocks: [
            {
              p:
                "Manter um site implica usar computadores de outras empresas. Estas são as " +
                "únicas envolvidas, e o que cada uma vê:",
            },
            {
              table: {
                head: ["Quem", "Para quê", "Onde"],
                rows: [
                  [
                    "Supabase",
                    "A base de dados e o sistema de autenticação",
                    "Irlanda (UE)",
                  ],
                  ["Render", "A API que calcula e serve as pontuações", "Frankfurt (UE)"],
                  [
                    "Vercel",
                    "Alojamento e entrega do próprio site, e contagem de visitas sem cookies",
                    "Rede global",
                  ],
                  [
                    "Google",
                    "A autenticação em si. A Google decide por si própria o que regista sobre o uso da sua conta Google",
                    "Infraestrutura da própria Google",
                  ],
                  [
                    "CARTO",
                    "As imagens do mapa. O seu navegador vai buscá-las diretamente, pelo que a CARTO recebe o seu endereço IP. Isto acontece tenha ou não conta",
                    "Infraestrutura da própria CARTO",
                  ],
                ],
              },
            },
            {
              p:
                "A Supabase, a Render e a Vercel agem por instrução e não fazem mais " +
                "nada com os seus dados. A Google e a CARTO são responsáveis pelo seu " +
                "próprio tratamento do lado delas, ao abrigo das respetivas políticas de " +
                "privacidade.",
            },
          ],
        },
        {
          id: "transfers",
          heading: "Saída da UE",
          blocks: [
            {
              p:
                "A base de dados e a API estão ambas dentro da UE: na Irlanda e em Frankfurt, " +
                "respetivamente. A Vercel, a Google e a CARTO são empresas norte-americanas, " +
                "pelo que alguns dados (sobretudo registos de servidor) podem ser tratados fora da " +
                "UE, ao abrigo das salvaguardas previstas nos termos de cada uma.",
            },
          ],
        },
        {
          id: "keep",
          heading: "Durante quanto tempo",
          blocks: [
            {
              list: [
                "Sessões: até as apagar, ou até apagar a conta.",
                "A sua conta: até a apagar. Não há expiração automática.",
                "Registos de servidor: durante os curtos períodos de retenção aplicados pelas empresas de alojamento, que são políticas delas e não nossas.",
              ],
            },
            {
              p:
                "Apagar a conta produz efeito imediato e leva consigo todas as sessões. Isso " +
                "é garantido pela própria base de dados e não por código que se " +
                "possa esquecer de correr.",
            },
            {
              p:
                "Uma limitação honesta sobre o modelo. À data desta versão, " +
                "nenhum modelo foi treinado com as avaliações de ninguém. Depois de o " +
                "ser, apagar a conta retira as suas avaliações de qualquer treino futuro, " +
                "mas um modelo já treinado não consegue desaprender o que aprendeu. O que " +
                "ele guarda são padrões gerais sobre condições de surf, não " +
                "as suas sessões individuais.",
            },
          ],
        },
        {
          id: "rights",
          heading: "Os seus direitos",
          blocks: [
            {
              p:
                "Ao abrigo do RGPD pode pedir uma cópia dos seus dados, corrigi-los, " +
                "apagá-los, limitar ou opor-se ao seu tratamento, e recebê-los num formato " +
                "portável.",
            },
            {
              p:
                "Apagar não exige pedido nenhum: abra a sua conta na aplicação e " +
                "escolha apagá-la. É imediato e total. Para tudo o resto, escreva para " +
                `${CONTACT_EMAIL} e terá resposta no prazo de um mês.`,
            },
            {
              p:
                "Se não ficar satisfeito, pode reclamar junto da Comissão Nacional de " +
                "Proteção de Dados (CNPD), ou da autoridade de controlo do país onde " +
                "vive.",
            },
          ],
        },
        {
          id: "security",
          heading: "Segurança",
          blocks: [
            {
              p:
                "Todo o tráfego usa HTTPS. A sua identidade é provada à API em cada " +
                "pedido por um token assinado que a API verifica contra as chaves públicas da " +
                "Google e da Supabase, e todas as consultas de sessões são filtradas pela " +
                "conta que perguntou. Nenhum sistema é perfeitamente seguro, e este é " +
                "mantido por uma só pessoa, o que vale a pena saber quando decidir o que " +
                "escrever numa nota.",
            },
          ],
        },
        {
          id: "children",
          heading: "Crianças",
          blocks: [
            {
              p:
                "O BeFORE não se destina a menores de 16 anos e os seus dados não são " +
                "recolhidos conscientemente. Se souber de uma conta criada por uma criança, " +
                `escreva para ${CONTACT_EMAIL} e será removida.`,
            },
          ],
        },
        {
          id: "changes",
          heading: "Alterações a esta página",
          blocks: [
            {
              p:
                "A data no topo muda sempre que o sentido muda. Se uma alteração afetar " +
                "mesmo o que é recolhido ou para que serve, será anunciada na " +
                "aplicação e não editada em silêncio.",
            },
          ],
        },
      ],
    },
  },

  terms: {
    en: {
      title: "Terms",
      summary:
        "BeFORE is a free personal project that scores surf conditions from public forecast data. " +
        "It is an estimate made by a computer, not advice, and it must never be your reason for " +
        "entering the water.",
      sections: [
        {
          id: "what",
          heading: "What BeFORE is",
          blocks: [
            {
              p:
                "BeFORE reads public marine and weather forecasts for spots on the Lisbon coast and " +
                "turns them into a score out of 10. It is free, it is a personal project, and it " +
                "carries no guarantee of any kind.",
            },
            {
              p:
                "The score is produced by a formula weighing wave size, wave period, wind and how " +
                "exposed the spot is to the swell. It is not a person's opinion and it is not, at " +
                "the time of writing, a trained model. Using it means accepting these terms.",
            },
          ],
        },
        {
          id: "safety",
          heading: "Safety. This is the part that matters",
          blocks: [
            {
              p:
                "The sea is dangerous and forecasts are often wrong. A score is a guess made from a " +
                "numerical model of the ocean, several hours old, for a point on a map.",
            },
            { p: "It knows nothing whatsoever about:" },
            {
              list: [
                "rip currents, rocks, reefs or how the sandbanks have moved",
                "how crowded the water is, or who else is in it",
                "your ability, your fitness or your equipment",
                "what the wind and the sea have done in the last ten minutes",
                "local warnings, flags, closures or lifeguard cover",
              ],
            },
            {
              p:
                "Never enter the water because BeFORE showed a high number. Look at the sea, check " +
                "the official forecasts and warnings, ask people who know the spot, and make your " +
                "own decision. You surf entirely at your own risk, and BeFORE is not responsible for " +
                "what happens when you do.",
            },
          ],
        },
        {
          id: "account",
          heading: "Your account",
          blocks: [
            {
              p:
                "Signing in requires a Google account. Keep it secure, since anyone who can use it " +
                "can reach your ratings. One account per person, and you must be at least 16 years " +
                "old.",
            },
          ],
        },
        {
          id: "content",
          heading: "What you log",
          blocks: [
            {
              p:
                "Your ratings remain yours. By logging them you allow BeFORE to store them and to " +
                "use them to run and improve the service, which specifically includes training " +
                "models that score surf conditions. That is the entire purpose of collecting them.",
            },
            {
              p:
                "Individual sessions are never published as yours. What comes out the other side is " +
                "a model, not a feed.",
            },
            {
              list: [
                "Do not put personal information about other people in your notes.",
                "Do not deliberately log ratings you know to be false. They are training data, so a false rating is not a prank, it makes the product worse for everyone.",
              ],
            },
          ],
        },
        {
          id: "use",
          heading: "Fair use",
          blocks: [
            {
              list: [
                "Do not attack, overload or disrupt the service, or try to reach data that is not yours.",
                "Do not scrape it in bulk. The underlying forecast data is public and free; take it from the source.",
                "Do not use BeFORE for anything unlawful.",
              ],
            },
          ],
        },
        {
          id: "availability",
          heading: "Availability",
          blocks: [
            {
              p:
                "BeFORE is provided as is, with no promise that it works, that it is accurate, or " +
                "that it stays available. It runs on free hosting, so the API sleeps when nobody is " +
                "using it and the first request after a quiet spell can take up to a minute. It may " +
                "change or shut down at any time.",
            },
          ],
        },
        {
          id: "liability",
          heading: "Liability",
          blocks: [
            {
              p:
                "To the fullest extent the law allows, BeFORE and its author are not liable for any " +
                "loss or damage arising from the use of, or inability to use, this service, " +
                "including any decision to go surfing.",
            },
            {
              p:
                "Nothing here limits liability that cannot be limited by law, and your rights as a " +
                "consumer are unaffected.",
            },
          ],
        },
        {
          id: "ending",
          heading: "Ending it",
          blocks: [
            {
              p:
                "You can delete your account at any time from within the app, which erases " +
                "everything immediately. Accounts that abuse the service may be suspended or " +
                "removed.",
            },
          ],
        },
        {
          id: "law",
          heading: "Governing law",
          blocks: [
            {
              p:
                "These terms are governed by Portuguese law, and disputes fall to the Portuguese " +
                "courts. If you are a consumer, this does not deprive you of the protection of the " +
                "law of the country where you live.",
            },
            { p: `Questions: ${CONTACT_EMAIL}.` },
          ],
        },
      ],
    },
    pt: {
      title: "Termos",
      summary:
        "O BeFORE é um projeto pessoal e gratuito que pontua as condições de surf a " +
        "partir de dados públicos de previsão. É uma estimativa feita por um " +
        "computador, não é aconselhamento, e nunca deve ser a sua razão para entrar " +
        "na água.",
      sections: [
        {
          id: "what",
          heading: "O que é o BeFORE",
          blocks: [
            {
              p:
                "O BeFORE lê previsões públicas marítimas e meteorológicas " +
                "para spots da costa de Lisboa e transforma-as numa pontuação de 0 a 10. " +
                "É gratuito, é um projeto pessoal, e não traz garantia nenhuma.",
            },
            {
              p:
                "A pontuação resulta de uma fórmula que pesa o tamanho da " +
                "ondulação, o período, o vento e o quanto o spot está exposto " +
                "à ondulação. Não é a opinião de uma pessoa e não " +
                "é, à data desta versão, um modelo treinado. Usar o BeFORE implica " +
                "aceitar estes termos.",
            },
          ],
        },
        {
          id: "safety",
          heading: "Segurança. É esta a parte que importa",
          blocks: [
            {
              p:
                "O mar é perigoso e as previsões erram muitas vezes. Uma " +
                "pontuação é um palpite tirado de um modelo numérico do oceano, " +
                "com algumas horas, para um ponto num mapa.",
            },
            { p: "Não sabe absolutamente nada sobre:" },
            {
              list: [
                "correntes de retorno, rochas, lajes ou como se moveram os bancos de areia",
                "quanta gente está na água, ou quem está",
                "a sua capacidade, a sua forma física ou o seu material",
                "o que o vento e o mar fizeram nos últimos dez minutos",
                "avisos locais, bandeiras, interdições ou presença de nadadores-salvadores",
              ],
            },
            {
              p:
                "Nunca entre na água por o BeFORE ter mostrado um número alto. Olhe para o " +
                "mar, consulte as previsões e os avisos oficiais, pergunte a quem conhece o " +
                "sítio, e decida por si. Surfa inteiramente por sua conta e risco, e o BeFORE " +
                "não é responsável pelo que acontecer.",
            },
          ],
        },
        {
          id: "account",
          heading: "A sua conta",
          blocks: [
            {
              p:
                "Entrar exige uma conta Google. Mantenha-a segura, já que quem lhe conseguir " +
                "aceder chega às suas avaliações. Uma conta por pessoa, e tem de ter " +
                "pelo menos 16 anos.",
            },
          ],
        },
        {
          id: "content",
          heading: "O que regista",
          blocks: [
            {
              p:
                "As suas avaliações continuam a ser suas. Ao registá-las, autoriza o " +
                "BeFORE a guardá-las e a usá-las para manter e melhorar o serviço, o " +
                "que inclui especificamente treinar modelos que pontuam condições de surf. " +
                "É essa a única razão por que são recolhidas.",
            },
            {
              p:
                "As sessões individuais nunca são publicadas como sendo suas. O que sai do " +
                "outro lado é um modelo, não um mural.",
            },
            {
              list: [
                "Não escreva informação pessoal sobre outras pessoas nas suas notas.",
                "Não registe deliberadamente avaliações que sabe serem falsas. São dados de treino, por isso uma avaliação falsa não é uma partida, piora o produto para toda a gente.",
              ],
            },
          ],
        },
        {
          id: "use",
          heading: "Uso responsável",
          blocks: [
            {
              list: [
                "Não ataque, sobrecarregue ou perturbe o serviço, nem tente aceder a dados que não são seus.",
                "Não faça recolha automática em massa. Os dados de previsão subjacentes são públicos e gratuitos; vá buscá-los à fonte.",
                "Não use o BeFORE para nada ilegal.",
              ],
            },
          ],
        },
        {
          id: "availability",
          heading: "Disponibilidade",
          blocks: [
            {
              p:
                "O BeFORE é fornecido tal como está, sem promessa de que funciona, de que " +
                "está certo ou de que continua disponível. Corre em alojamento gratuito, " +
                "pelo que a API adormece quando ninguém a usa e o primeiro pedido depois de um " +
                "período parado pode demorar quase um minuto. Pode mudar ou encerrar a qualquer " +
                "momento.",
            },
          ],
        },
        {
          id: "liability",
          heading: "Responsabilidade",
          blocks: [
            {
              p:
                "Na medida máxima permitida por lei, o BeFORE e o seu autor não são " +
                "responsáveis por qualquer perda ou dano resultante do uso, ou da " +
                "impossibilidade de uso, deste serviço, incluindo qualquer decisão de ir " +
                "surfar.",
            },
            {
              p:
                "Nada aqui limita responsabilidade que a lei não permita limitar, e os seus " +
                "direitos enquanto consumidor mantêm-se intactos.",
            },
          ],
        },
        {
          id: "ending",
          heading: "Terminar",
          blocks: [
            {
              p:
                "Pode apagar a sua conta a qualquer momento dentro da aplicação, o que " +
                "elimina tudo de imediato. Contas que abusem do serviço podem ser suspensas ou " +
                "removidas.",
            },
          ],
        },
        {
          id: "law",
          heading: "Lei aplicável",
          blocks: [
            {
              p:
                "Estes termos regem-se pela lei portuguesa e os litígios cabem aos tribunais " +
                "portugueses. Se for consumidor, isto não o priva da proteção da lei " +
                "do país onde vive.",
            },
            { p: `Dúvidas: ${CONTACT_EMAIL}.` },
          ],
        },
      ],
    },
  },
};
