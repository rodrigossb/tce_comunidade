/* DE → PARA das salas dos cursos (nomes usados na programação da Escola de Contas) para os ambientes
   numerados da planta de ambientação. VALIDADO pela organização em 31/10/2026.
   Chaves = venue da programação; valores = id do ambiente em js/data.js → maps[venue].places
   (o número depois do "jn-r"/"mg-r" é o número da sala na planta). Usado pelo app, pelo totem e pelo resumo. */
(function (root) {
  'use strict';
  root.TCE_COURSE_ROOMS = {
    jn: { // Escola Estadual Joaquim Nabuco
      'Laboratório I': 'jn-r01',  // Laboratório de Informática I  = 01
      'Laboratório II': 'jn-r02', // Laboratório de Informática II = 02
      'Sala I': 'jn-r08',         // = 08
      'Sala II': 'jn-r09',        // = 09
      'Sala III': 'jn-r11',       // = 11
      'Sala IV': 'jn-r13',        // = 13
      'Sala V': 'jn-r20',         // = 20
      'Sala VI': 'jn-r24',        // = 24
    },
    manga: { // Escola Estadual Indígena Jorge Iaparrá · Aldeia do Manga
      'Laboratório I': 'mg-r12',  // Laboratório de informática = 12
      'Sala I': 'mg-r13',         // Sala 1 = 13
    },
    // sebrae e auditorio: locais sem planta.
  };
})(typeof window !== 'undefined' ? window : globalThis);
