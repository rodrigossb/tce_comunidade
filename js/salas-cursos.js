/* DE → PARA das salas dos cursos (como aparecem na programação da Escola de Contas) para os ambientes
   numerados da planta de ambientação. SUGESTÃO A VALIDAR com a organização: a programação usa nomes
   antigos (Sala I–V, Laboratório I–II) e a planta numera todos os ambientes (01–25).
   Usado, por enquanto, só pelo totem (mapa e caminho até a sala do curso). Chaves = venue da programação;
   valores = id do ambiente em js/data.js → maps[venue].places. */
(function (root) {
  'use strict';
  root.TCE_COURSE_ROOMS = {
    jn: { // Escola Estadual Joaquim Nabuco
      'Laboratório I': 'jn-r01',  // 01 · Laboratório de informática
      'Laboratório II': 'jn-r02', // 02 · Laboratório de informática
      'Sala I': 'jn-r04',         // 04 (fileira de baixo, perto do Acesso 1)
      'Sala II': 'jn-r05',        // 05
      'Sala III': 'jn-r07',       // 07
      'Sala IV': 'jn-r08',        // 08
      'Sala V': 'jn-r09',         // 09
    },
    manga: { // Escola Estadual Indígena Jorge Iaparrá · Aldeia do Manga
      'Sala I': 'mg-r13',         // 13 · Educação e qualificação profissional
      'Laboratório I': 'mg-r12',  // 12 · TCE Orienta · sala de informática
    },
    // sebrae e auditorio: locais sem planta.
  };
})(typeof window !== 'undefined' ? window : globalThis);
