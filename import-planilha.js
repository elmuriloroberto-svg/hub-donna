/**
 * import-planilha.js — Importa contatos da planilha para o Supabase (crm_clientes)
 *
 * Uso: node import-planilha.js
 *
 * Regras:
 *  - Se fone === celular → um link só
 *  - Se fone !== celular → dois links (ambos em telefones[])
 *  - Não sobrescreve dados financeiros (qtd_pedidos, ticket_medio, etc.)
 *  - Upsert por nome (ON CONFLICT nome DO UPDATE SET celular/telefone/telefones)
 */

require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const { getSupabase } = require('./backend/lib/supabase');

// ── Normalização ───────────────────────────────────────────────────────────────
function normalizePhones(rawList) {
  const seen = new Set();
  const result = [];
  for (const raw of rawList) {
    if (!raw) continue;
    const str = String(raw).trim();
    if (!str) continue;
    const digits = str.replace(/\D/g, '');
    if (digits.length < 8) continue;
    const wa = (digits.startsWith('55') && digits.length >= 12) ? digits : '55' + digits;
    if (!seen.has(wa)) { seen.add(wa); result.push(wa); }
  }
  return result;
}

// ── Dados brutos da planilha ───────────────────────────────────────────────────
// Colunas: nome | fone (col B) | celular (col C)
// Entradas sem telefone e nomes incompletos/internos foram omitidos.
const RAW = [
  // Página 1
  { nome: 'MURILO ROBERTO DA SILVA BEZERRA',           fone: '',                 celular: '(61) 99989-1743' },
  { nome: 'EXPRESS DEPILLESE',                          fone: '(61) 3551-8838',   celular: '' },
  { nome: 'RHEAL EXPRESS ASA SUL',                      fone: '',                 celular: '(61) 99206-7579' },
  { nome: 'PATRICIA DE ALMEIDA PINTO',                  fone: '(61) 99424-9729',  celular: '(61) 99424-9729' },
  { nome: 'VIRGINIA UNHA DE PRINCESA',                  fone: '',                 celular: '(61) 99919-5848' },
  { nome: 'Star Studio Studio Saúde e Beleza',          fone: '(61) 98347-2449',  celular: '(61) 98347-2449' },
  { nome: 'LEIA',                                       fone: '',                 celular: '(61) 99580-1635' },
  { nome: 'welisangela',                                fone: '(61) 98499-1940',  celular: '' },
  { nome: 'FERNANDA MAYARA',                            fone: '(61) 99812-9477',  celular: '' },
  { nome: 'ANAILDE AZEVEDO MARTINS',                    fone: '(61) 99957-5698',  celular: '' },
  { nome: 'ALEJANDRA OLIVEIRA',                         fone: '(61) 98169-8921',  celular: '' },
  { nome: 'Rosiany Rodovalho de Sousa',                 fone: '(61) 98103-1037',  celular: '' },
  { nome: 'JOSIANE GONÇALVEZ SANTOS',                   fone: '(61) 98158-5980',  celular: '' },
  { nome: 'SIMONE LIMA DE SOUZA',                       fone: '(61) 99945-2036',  celular: '' },
  { nome: 'ELISANGELA PEREIRA SILVA',                   fone: '(61) 98499-1940',  celular: '' },
  { nome: 'Bruna Leal',                                 fone: '(61) 99252-0708',  celular: '' },
  { nome: 'EDILENE SANTOS DE OLIVEIRA',                 fone: '(61) 99128-1103',  celular: '' },
  { nome: 'BRUNA BARROS INACIO DE OLIVEIRA',            fone: '',                 celular: '(61) 99512-9776' },
  { nome: 'INSTITUTO DE BELEZA INFINITY HAIR SALAO BOUTIQUE LTDA', fone: '(61) 98351-0847', celular: '' },
  { nome: 'CHEZ BALI',                                  fone: '',                 celular: '(61) 98220-6374' },
  { nome: 'JESSICA COSTA',                              fone: '(61) 98172-1024',  celular: '' },
  { nome: 'JOANA CATARINA',                             fone: '',                 celular: '(61) 99932-5994' },
  { nome: 'KZAM NAILS CONCEITO EM NATURALIDADE LTDA',  fone: '98114-1397',        celular: '' },
  { nome: 'lucilia lima da silva',                      fone: '(61) 9651-2789',   celular: '' },

  // Página 2
  { nome: 'HELLENING CAMILY RODRIGUES SAMPAIO',        fone: '',                 celular: '(61) 99263-8236' },
  { nome: 'Taina Ricardo Alves',                        fone: '',                 celular: '(61) 98528-5618' },
  { nome: 'REGINA SOUSA BEAUTY',                        fone: '',                 celular: '(61) 98275-4760' },
  { nome: 'LUISA ROCHA CAMPOS',                         fone: '',                 celular: '(61) 98505-9787' },
  { nome: 'Zenilda Nascimento Amaral',                  fone: '',                 celular: '(61) 98491-4761' },
  { nome: 'MARCELLA GEOVANA',                           fone: '',                 celular: '(61) 98541-8560' },
  { nome: 'VIVIANE SOUTO',                              fone: '',                 celular: '(61) 99875-3202' },
  { nome: 'RAFAELA LEAL',                               fone: '',                 celular: '(61) 99131-6234' },
  { nome: 'PRISCILA EMANUELLA',                         fone: '',                 celular: '(61) 99901-1917' },
  { nome: 'Larissa Rocha',                              fone: '',                 celular: '(61) 98144-4405' },
  { nome: 'ELIZABETE CAVALCANTE',                       fone: '',                 celular: '(61) 99311-5525' },
  { nome: 'Luzia Maria',                                fone: '',                 celular: '(61) 99904-2651' },
  { nome: 'KELLY BRENDA SANTANA DA SILVA',              fone: '(61) 98281-3095',  celular: '' },
  { nome: 'MIRIDAN BALDES',                             fone: '',                 celular: '(61) 98402-3910' },
  { nome: 'CAMILLA VIEIRA',                             fone: '',                 celular: '(61) 99319-6848' },
  { nome: 'FRANCIELLI RAIMOND',                         fone: '(61) 98161-2108',  celular: '' },
  { nome: 'THAMARA CRISTINA',                           fone: '(61) 99330-1232',  celular: '' },
  { nome: 'TAINARA LINS RODRIGUES',                     fone: '(61) 98149-3635',  celular: '' },
  { nome: 'JOSIANE DA CRUZ GOMES BASTOS',               fone: '(61) 98662-1565',  celular: '' },
  { nome: 'SAMARA NOGUEIRA',                            fone: '(61) 99876-5979',  celular: '' },
  { nome: 'YSABELLA AMORIM SIQUEIRA',                   fone: '(61) 98566-9771',  celular: '' },

  // Página 3
  { nome: 'OLIVIA OLIVEIRA',                            fone: '(61) 9698-6682',   celular: '' },
  { nome: 'Aline cristina',                             fone: '(61) 98428-1940',  celular: '' },
  { nome: 'LUISA PAIVA',                                fone: '(61) 98119-4026',  celular: '' },
  { nome: 'DANIELDA DA SILVA',                          fone: '(11) 97225-8492',  celular: '' },
  { nome: 'PALOMA MORAIS BARROS',                       fone: '(61) 99661-9132',  celular: '' },
  { nome: 'marta ferreira',                             fone: '(61) 99953-2563',  celular: '' },
  { nome: 'GEYSE KELLY',                                fone: '(61) 99850-1834',  celular: '' },
  { nome: 'CINTHIA ALBUQUERQUE',                        fone: '(61) 98144-9378',  celular: '' },
  { nome: 'ELAINE NERES PAZ',                           fone: '(61) 99319-7058',  celular: '' },
  { nome: 'PALOMMA VIEIRA ALVES',                       fone: '(61) 9580-3299',   celular: '' },
  { nome: 'LUCIENE SANTOS',                             fone: '(61) 98207-4187',  celular: '' },
  { nome: 'IRISLENE LOPES',                             fone: '(61) 99520-3858',  celular: '' },
  { nome: 'ESPACO MAE BONITA LTDA',                     fone: '',                 celular: '(61) 99511-6556' },
  { nome: 'GISELE ARAUJO',                              fone: '(61) 99827-7154',  celular: '' },
  { nome: 'Aline Regina Oliveira Duarte',               fone: '(61) 98296-1145',  celular: '' },
  { nome: 'LAUREN LIETE DA SILVA BARBOSA',              fone: '(61) 98478-2148',  celular: '' },
  { nome: 'ELCIO MARQUES',                              fone: '(98) 6462-0339',   celular: '' },
  { nome: 'ALINE DOS SANTOS TEIXEIRA',                  fone: '',                 celular: '(61) 99182-4751' },
  { nome: 'BIANCA VIEIRA',                              fone: '',                 celular: '(61) 98164-5382' },
  { nome: 'KAMILA OLIVEIRA',                            fone: '',                 celular: '(61) 99567-0479' },
  { nome: 'UNHA DE BONECA ESMALTERIA E ESTETICA ASA NORTE LTDA', fone: '(61) 99236-3443', celular: '(61) 99236-3443' },
  { nome: 'TALYTA KÉSCIA',                              fone: '(61) 98652-8358',  celular: '' },
  { nome: 'SKARLET SANTY',                              fone: '',                 celular: '(61) 99518-3253' },
  { nome: 'LUCILENE LIMA DE SOUZA',                     fone: '(61) 98368-5464',  celular: '' },
  { nome: 'Laura Juliana da costa Gonzaga',             fone: '',                 celular: '(61) 98586-0317' },
  { nome: 'PERILANE MOURA',                             fone: '(61) 99335-5959',  celular: '' },
  { nome: 'Morgana torres',                             fone: '',                 celular: '(61) 98124-3740' },
  { nome: 'CRISTYNA DIAS ROSA',                         fone: '(61) 99128-1579',  celular: '' },

  // Página 4
  { nome: 'AMANDA NOGUEIRA',                            fone: '(61) 99961-4758',  celular: '' },
  { nome: 'Jacleane',                                   fone: '+55 61 8168-7959', celular: '' },
  { nome: 'Monise Brasileiro',                          fone: '(61) 99998-3322',  celular: '(61) 99998-3322' },
  { nome: 'Elizângela Tavares da Silva',                fone: '(61) 99800-4845',  celular: '' },
  { nome: 'Lorena carla rosa dias',                     fone: '',                 celular: '(61) 9649-1431' },
  { nome: 'JESSICA SILVA',                              fone: '(61) 99252-3801',  celular: '' },
  { nome: 'RENATA GOMES',                               fone: '',                 celular: '(61) 98260-0373' },
  { nome: 'LAURILENE SOARES FREITAS',                   fone: '',                 celular: '(61) 99592-3716' },
  { nome: 'BRENDA GABRIELA SANTANA DOS SANTOS',         fone: '',                 celular: '(61) 98607-7558' },
  { nome: 'DIELLE BRAGA',                               fone: '',                 celular: '(61) 99133-1525' },
  { nome: 'KATIA LUCIA GOMES DOS SANTOS',               fone: '(61) 98420-9770',  celular: '' },
  { nome: 'JANIFFER SILVA',                             fone: '(61) 9134-2349',   celular: '' },
  { nome: 'CINTIA RAQUEL DE JESUS SILVA',               fone: '',                 celular: '(61) 99313-0819' },
  { nome: 'JJS COM E SERV LTDA',                        fone: '(61) 3011-2661',   celular: '' },
  { nome: 'FRANCILENE PIRES',                           fone: '(61) 98592-2856',  celular: '' },
  { nome: 'FABIANA BISPO DOS SANTOS',                   fone: '',                 celular: '(61) 99800-4675' },
  { nome: 'RAYCKA ALVES DE BARROS',                     fone: '',                 celular: '(61) 98351-0847' },
  { nome: 'Raysla Bruna',                               fone: '',                 celular: '(61) 99884-9568' },
  { nome: 'LETICIA VARGAS',                             fone: '61995557406',      celular: '' },
  { nome: 'KALITA GENI DA SILVA LOURENÇO',              fone: '',                 celular: '(61) 98491-4303' },
  { nome: 'GRAZIELLE KINOPF',                           fone: '(51) 98121-5537',  celular: '' },
  { nome: 'JOSELMA CESARIO',                            fone: '',                 celular: '(61) 99185-4117' },
  { nome: 'LETICIA NUNES PEREIRA',                      fone: '',                 celular: '(61) 99545-5961' },
  { nome: 'JOSILEIA DA SILVA MAGALHÃES',                fone: '',                 celular: '(61) 98196-1325' },
  { nome: 'VIVIAN DE FARIAS',                           fone: '',                 celular: '(61) 98601-4168' },
  { nome: 'RENATA SILVEIRA',                            fone: '(61) 99826-3597',  celular: '' },
  { nome: 'RAFAELA MARTINS',                            fone: '',                 celular: '(61) 8191-7277' },

  // Página 5
  { nome: 'LUISA PELLI MATTIELLO',                      fone: '',                 celular: '61999564401' },
  { nome: 'EMILLY LARA GONÇALVEZ',                      fone: '',                 celular: '61982895865' },
  { nome: 'CAMILA MONTEIRO DANTAS',                     fone: '(61) 98456-8149',  celular: '' },
  { nome: 'MARIA LÚCIA DA SILVA',                       fone: '',                 celular: '(61) 98138-6623' },
  { nome: 'ALICE CALDAS BARBOSA',                       fone: '',                 celular: '(61) 98319-2932' },
  { nome: 'CAMILA SILVA',                               fone: '(61) 99417-5830',  celular: '' },
  { nome: 'MAÍRA DA SILVA',                             fone: '(61) 98588-8696',  celular: '' },
  { nome: 'BARBARA DE MOURA PEREIRA',                   fone: '(61) 98554-2252',  celular: '' },
  { nome: 'KATIA FABRICIA RIBEIRO ANTUNES',             fone: '(61) 99800-9474',  celular: '' },
  { nome: 'INGRID VICENTE DOS SANTOS',                  fone: '(61) 99621-7355',  celular: '' },
  { nome: 'ADNA',                                       fone: '(77) 99906-2928',  celular: '' },
  { nome: 'PATRÍCIA MANOELE COSTA DE MESQUITA',         fone: '',                 celular: '(61) 98508-6323' },
  { nome: 'ALINE BATISTA GUALTER',                      fone: '',                 celular: '(61) 99255-6241' },
  { nome: 'AGDA DYENN MONTALVÃO DA SILVA',              fone: '(61) 3203-3529',   celular: '(61) 99507-0780' },
  { nome: 'ERICA MACIEL',                               fone: '',                 celular: '(61) 99158-8606' },
  { nome: 'VICTORIA RAMOS DE ARAUJO',                   fone: '',                 celular: '(61) 98455-0889' },
  { nome: 'PATRÍCIA LOPES',                             fone: '',                 celular: '(61) 99552-7249' },
  { nome: 'GABRIELE OLIVEIRA',                          fone: '',                 celular: '(61) 98175-3624' },
  { nome: 'ANATALIA MARIA CARVALHO SILVA',              fone: '',                 celular: '(61) 98505-9233' },
  { nome: 'ANA TAINA CAETANO',                          fone: '(61) 98199-4907',  celular: '' },
  { nome: 'Bárbara Helen S. Araujo',                    fone: '',                 celular: '(61) 98470-0890' },
  { nome: 'CLAUDIANA GOMES DE OLIVEIRA',                fone: '',                 celular: '(61) 98167-5772' },
  { nome: 'YASMIN ROCHA',                               fone: '',                 celular: '(61) 99988-2811' },
  { nome: 'NATÁLIA FRANCO',                             fone: '',                 celular: '(61) 99846-8710' },
  { nome: 'JULIANA SOUSA SILVA',                        fone: '',                 celular: '(61) 99417-0617' },

  // Página 6
  { nome: 'JESSICA OLIVEIRA',                           fone: '',                 celular: '(61) 99699-4395' },
  { nome: 'CAMILA SOUSA',                               fone: '',                 celular: '(61) 99441-6336' },
  { nome: 'IZABELLE BRANDAO',                           fone: '',                 celular: '(61) 99421-6479' },
  { nome: 'KAROLINNE LIZETE',                           fone: '',                 celular: '61981940290' },
  { nome: 'FRANCIELE DE LIMA',                          fone: '(51) 99308-4597',  celular: '' },
  { nome: 'TATYANNA GOIS',                              fone: '(61) 99631-8011',  celular: '' },
  { nome: 'JOSEFA PREREIRA DA SILVA NETA',              fone: '(61) 98541-6110',  celular: '' },
  { nome: 'MARA STAUT',                                 fone: '',                 celular: '(61) 99129-0005' },
  { nome: 'CAMILA SICCA',                               fone: '',                 celular: '(61) 99813-0214' },
  { nome: 'BRUNA LEMOS',                                fone: '',                 celular: '(61) 98183-8401' },
  { nome: 'IRAIDES BARBOSA',                            fone: '',                 celular: '(61) 99663-8919' },
  { nome: 'MARCIA SILVA',                               fone: '(61) 99987-6719',  celular: '' },
  { nome: 'SOLANGE NOGUEIRA',                           fone: '',                 celular: '(61) 99145-7619' },
  { nome: 'Nayara Damião',                              fone: '',                 celular: '(61) 98489-6376' },
  { nome: 'Sabrina Melo',                               fone: '(61) 98401-5550',  celular: '' },
  { nome: 'GLAICIMARA FREITAS VIDAL',                   fone: '(61) 98383-1806',  celular: '' },
  { nome: 'ISTEFANI DA SILVA',                          fone: '(61) 98200-1388',  celular: '' },
  { nome: 'DALLYANA JARDIM',                            fone: '(61) 98194-6035',  celular: '' },
  { nome: 'ROSANA CALAZANS',                            fone: '',                 celular: '(61) 99525-7809' },
  { nome: 'ADRIELE PEREIRA ARAÚJO COSTA',               fone: '(86) 9957-7632',   celular: '' },
  { nome: 'MIRIAM SANTOS MEDEIROS',                     fone: '',                 celular: '(61) 99513-1749' },
  { nome: 'KELLEN CRISTIANE SILVA',                     fone: '',                 celular: '(61) 98181-2048' },
  { nome: 'FRANCILENE OUVEIA',                          fone: '(61) 98142-8236',  celular: '' },
  { nome: 'HILLARY GABRIELLY LOPES DE OLIVEIRA',        fone: '',                 celular: '(61) 98175-3624' },
  { nome: 'LARISSA ALVES',                              fone: '',                 celular: '(61) 98652-3181' },

  // Página 7
  { nome: 'Giovanna Dristig',                           fone: '',                 celular: '(61) 98121-2602' },
  { nome: 'CLARISSA BARROS',                            fone: '',                 celular: '(61) 98217-5080' },
  { nome: 'JESSICA DE LIMA',                            fone: '',                 celular: '(61) 99991-2947' },
  { nome: 'MARIA APARECIDA CORREIA DE AMORIM',          fone: '(61) 99961-1221',  celular: '' },
  { nome: 'PAULA AMORIM DE QUEIROZ',                    fone: '(61) 99537-9667',  celular: '' },
  { nome: 'TATHIANY VARGAS',                            fone: '(61) 99909-3579',  celular: '' },
  { nome: 'Amanda de Oliveira Coutinho',                fone: '(61) 99925-6600',  celular: '' },
  { nome: 'GILMARA DUTRA DA COSTA',                     fone: '(61) 99436-6394',  celular: '' },
  { nome: 'VANESSA GOMES DA SILVA',                     fone: '',                 celular: '(61) 99622-5455' },
  { nome: 'SUBLIME SERVICOS DE BELEZA LTDA',            fone: '',                 celular: '(61) 98260-0373' },
  { nome: 'JOSIANE DA SILVA RIBEIRO',                   fone: '(61) 98214-2521',  celular: '' },
  { nome: 'VANDERLEIA',                                 fone: '(61) 98149-7737',  celular: '' },
  { nome: 'RAQUEL MÁRCIA NOGUEIRA',                     fone: '(61) 99976-4545',  celular: '' },
  { nome: 'ADRIANO DA COSTA',                           fone: '',                 celular: '(99) 8525-0567' },
  { nome: 'GLAUCIA SOUSA BEZERRA',                      fone: '',                 celular: '(61) 99279-4694' },
  { nome: 'MARIA ELINELMA CARVALHO',                    fone: '',                 celular: '(61) 99326-6671' },
  { nome: 'ANA LUIZA QUEIROGA',                         fone: '',                 celular: '(61) 98135-4551' },
  { nome: 'EMILY LIMA DE SOUSA',                        fone: '(61) 98162-8326',  celular: '' },
  { nome: 'GABRIELA FERREIRA MARINHO',                  fone: '(61) 98139-6206',  celular: '' },
  { nome: 'HAIANNA REZENDE',                            fone: '',                 celular: '(61) 99137-5440' },
  { nome: 'JANAINA SIQUEIRA',                           fone: '(61) 99667-5678',  celular: '' },
  { nome: 'CAROLINE LAIS',                              fone: '',                 celular: '(61) 99358-3837' },
  { nome: 'ANA CAROLINE XIMENES POLVEIRO',              fone: '',                 celular: '(61) 99603-1301' },
  { nome: 'RUANA COUTINHO',                             fone: '',                 celular: '(61) 99664-8183' },
  { nome: 'ANA GABRIELLA SILVA LARCEDA',                fone: '',                 celular: '(61) 98627-1393' },
  { nome: 'MILENA SOUSA DE LIRA',                       fone: '',                 celular: '(61) 99283-9522' },

  // Página 8
  { nome: 'TAYANNA ALENCAR',                            fone: '(61) 99317-3500',  celular: '' },
  { nome: 'JULIANA CARVALHO SANTOS',                    fone: '',                 celular: '(61) 99228-0729' },
  { nome: 'ANGÉLICA SOUZA',                             fone: '',                 celular: '(61) 99127-2116' },
  { nome: 'CRISTINA ALVES COUTO',                       fone: '',                 celular: '(61) 99610-0830' },
  { nome: 'Ana escovei',                                fone: '(61) 98288-8135',  celular: '' },
  { nome: 'JULIANA BARBOSA',                            fone: '',                 celular: '(61) 99994-8251' },
  { nome: 'PRECIOSA ESMALTERIA',                        fone: '',                 celular: '(61) 99113-1974' },
  { nome: 'PAULA KZAM',                                 fone: '(61) 98114-1397',  celular: '' },
  { nome: 'DIANA LIMA DE SOUSA',                        fone: '',                 celular: '(61) 98615-4885' },
  { nome: 'IVANILDE CONCEIÇAO DE SOUSA',                fone: '(61) 99298-9421',  celular: '' },
  { nome: 'MARIA TERESA PINHEIRO',                      fone: '',                 celular: '(61) 99236-2076' },
  { nome: 'MICAELLY TEIXEIRA',                          fone: '',                 celular: '(61) 99318-2704' },
  { nome: 'LIDIANE MARIA QUEIROZ',                      fone: '(61) 99819-3020',  celular: '' },
  { nome: 'MARIA APARECIDA DA COSTA',                   fone: '',                 celular: '(61) 98167-1875' },
  { nome: 'Amanda Sousa beauty',                        fone: '(61) 99298-9057',  celular: '' },
  { nome: 'ROSILENE FREITAS',                           fone: '(61) 99411-7904',  celular: '' },
  { nome: 'PAOLA COSTA',                                fone: '',                 celular: '(61) 98612-8043' },
  { nome: 'LORENA MONTEIRO FALCÃO',                     fone: '',                 celular: '(61) 99113-1974' },
  { nome: 'jacyara lima fonseca',                       fone: '',                 celular: '61999355044' },
  { nome: 'ALESSANDRA NUNES',                           fone: '',                 celular: '(61) 98375-1937' },
  { nome: 'NAYARA MENDES',                              fone: '',                 celular: '(77) 99118-3152' },
  { nome: 'MARIANA BATISTA',                            fone: '(61) 99335-0979',  celular: '' },
  { nome: 'MARIA EDUARDA GONÇALVES',                    fone: '',                 celular: '(61) 98104-8447' },

  // Página 9
  { nome: 'GABRIELLE MOREIRA',                          fone: '',                 celular: '(61) 99676-2964' },
  { nome: 'KETILEY CRISTINA',                           fone: '',                 celular: '(61) 98300-3943' },
  { nome: 'RAFAELA PEREIRA',                            fone: '',                 celular: '(61) 99377-9889' },
  { nome: 'LEILA ANABELE SALAO BELEZA TROPICAL',        fone: '61986355979',      celular: '' },
  { nome: 'VITORIA DE LIMA',                            fone: '',                 celular: '(61) 98160-3696' },
  { nome: 'VALERIA SANTANA DE OLIVEIRA',                fone: '(61) 98417-6067',  celular: '' },
  { nome: 'Débora Xavier de Souza',                     fone: '',                 celular: '(61) 98622-0075' },
  { nome: 'DÉBORA VERAS',                               fone: '',                 celular: '(61) 98426-5751' },
  { nome: 'GLEICE ELLEN',                               fone: '',                 celular: '(61) 99213-2010' },
  { nome: 'vanderlei ramos rodrigues',                  fone: '',                 celular: '(61) 98149-7737' },
  { nome: 'GREICE KELLY PEIXOTO',                       fone: '',                 celular: '61981387289' },
  { nome: 'AVIVAH SALÃO DE BELEZA',                     fone: '(61) 98358-8969',  celular: '' },
  { nome: 'IONEIDE BARBOSA',                            fone: '',                 celular: '(61) 99808-5742' },
  { nome: 'CAROLINE',                                   fone: '',                 celular: '(61) 98213-5564' },
  { nome: 'VALQUIRIA COSTA',                            fone: '(61) 99289-2029',  celular: '' },
  { nome: 'SIBMA SOUZA',                                fone: '(61) 99810-7961',  celular: '' },
  { nome: 'DIOLINA SANTOS ALMEIDA',                     fone: '',                 celular: '(61) 99439-5885' },
  { nome: 'RAYANNE GOMES',                              fone: '',                 celular: '(61) 99509-6802' },
  { nome: 'ADENAILDE CORREA',                           fone: '',                 celular: '(61) 99859-1066' },
  { nome: 'ROSINELIA QUEIROZ GOMES',                    fone: '',                 celular: '(61) 98227-0610' },
  { nome: 'VALQUIRIA DA SILVA DE CAMPOS',               fone: '',                 celular: '(61) 98224-2418' },
  { nome: 'RUAMA FREITAS DE OLIVEIRA',                  fone: '',                 celular: '(61) 98139-6838' },
  { nome: 'Milena Campos',                              fone: '',                 celular: '(61) 98114-7879' },

  // Página 10
  { nome: 'ANDREIA DE OLIVEIRA ALMEIDA',                fone: '',                 celular: '(61) 98132-7529' },
  { nome: 'ANDREA MONTEIRO AGUIAR DE MOURA',            fone: '',                 celular: '(61) 98181-6531' },
  { nome: 'Instituto de beleza Bacellar',               fone: '(61) 98625-5090',  celular: '' },
  { nome: 'PAOLA MARTINS MOREIRA',                      fone: '',                 celular: '(61) 98220-9185' },
  { nome: 'CLAUDIA HELENA WUZIUS',                      fone: '',                 celular: '(49) 98881-9749' },
  { nome: 'ANA RIBEIRO',                                fone: '',                 celular: '(61) 98177-0529' },
  { nome: 'JOYCE BELTRÃO',                              fone: '',                 celular: '(61) 98221-0646' },
  { nome: 'MEIRE FERREIRA DE OLIVEIRA',                 fone: '',                 celular: '(61) 99404-7686' },
  { nome: 'ICELIA GOMES DE SOUZA',                      fone: '',                 celular: '(61) 98471-1331' },
  { nome: 'DANIELLE DE PAULA LIRA',                     fone: '',                 celular: '(61) 99189-1111' },
  { nome: 'THAIS PACHECO',                              fone: '',                 celular: '(61) 99929-6470' },
  { nome: 'PIETTRA SUHETT',                             fone: '',                 celular: '(61) 98253-9550' },
  { nome: 'FK BELEZA E COSMETICOS LTDA',                fone: '',                 celular: '(61) 98133-3652' },
  { nome: 'ERLANE DA PAIXÃO',                           fone: '',                 celular: '(61) 99629-1998' },
  { nome: 'ELIANE RODRIGUES',                           fone: '',                 celular: '(61) 98170-6065' },
  { nome: 'NÁDIA VIANA',                                fone: '',                 celular: '(61) 98646-4312' },
  { nome: 'GRACILDA CALDEIRA',                          fone: '',                 celular: '(61) 98580-1977' },
  { nome: 'POLIANE DA SILVA MARTINS',                   fone: '',                 celular: '(61) 99670-8799' },
  { nome: 'HELAINE CAROLINE',                           fone: '',                 celular: '(61) 98213-5564' },
  { nome: 'GERALDA BERNARDO DA COSTA',                  fone: '',                 celular: '(61) 99873-5510' },
  { nome: 'GLEICIANE DA CONCEÇÃO NASCIMENTO',           fone: '',                 celular: '(61) 99647-6910' },
  { nome: 'KATARINA SIMPLICIO',                         fone: '(61) 9818-3719',   celular: '' },
  { nome: 'KAROLINE SIMPLICIO AMBROSIO',                fone: '(61) 98184-9294',  celular: '' },
  { nome: 'MICHELLE LANER SANTOS',                      fone: '(61) 98210-4643',  celular: '' },
  { nome: 'CAROLINE CAMPOS',                            fone: '',                 celular: '(61) 99952-1296' },
  { nome: 'OLIVIA VITORIA',                             fone: '',                 celular: '(61) 99640-6992' },
  { nome: 'DEISE RODRIGUES TEIXEIRA',                   fone: '',                 celular: '(61) 99440-2390' },
  { nome: 'MARIA EDNA VASCONCELOS',                     fone: '',                 celular: '(61) 98209-2800' },
  { nome: 'VANESSA RAMOS ANDRIOLI',                     fone: '',                 celular: '(69) 99262-8552' },
  { nome: 'KARINA',                                     fone: '',                 celular: '(61) 98374-0247' },

  // Página 11
  { nome: 'ANA PAULA DOS REIS PEREIRA',                 fone: '',                 celular: '(61) 99641-5600' },
  { nome: 'NAIARA BARBOSA',                             fone: '(61) 98370-9276',  celular: '' },
  { nome: 'MARIA FLORACY',                              fone: '',                 celular: '(61) 99806-9209' },
  { nome: 'MICHELLE MELO DOS SANTOS',                   fone: '',                 celular: '(61) 99525-0152' },
  { nome: 'RENATA DE OLIVEIRA',                         fone: '',                 celular: '(61) 99966-6028' },
  { nome: 'PATRICIA MUSSI',                             fone: '',                 celular: '(61) 99637-3731' },
  { nome: 'VIVIANE BARROS',                             fone: '',                 celular: '(61) 99231-1140' },
  { nome: 'AURISTELA MAIARA ARAGAO',                    fone: '',                 celular: '(61) 98160-6705' },
  { nome: 'VICTORIA DOS SANTOS ROCHA VIEIRA',           fone: '',                 celular: '(61) 98159-9574' },
  { nome: 'LETICIA HOLANDA',                            fone: '(61) 99819-2939',  celular: '' },
  { nome: 'FLAVIA LOPES',                               fone: '(61) 98220-7860',  celular: '' },
  { nome: 'ALEXIA BARBARA',                             fone: '(61) 99804-2213',  celular: '' },
  { nome: 'CRISTIANE DE JESUS',                         fone: '',                 celular: '(61) 98219-6623' },
  { nome: 'IRAILDE ALMEIDA',                            fone: '',                 celular: '(61) 99655-6455' },
  { nome: 'BEAUTY B',                                   fone: '(61) 3532-8401',   celular: '' },
  { nome: 'MARIA RAYNARA SILVA CORREIA',                fone: '',                 celular: '(61) 98597-1188' },
  { nome: 'CAMILA CASTRO',                              fone: '',                 celular: '61981092621' },
  { nome: 'AURIVANIA GOMES',                            fone: '',                 celular: '61996723180' },
  { nome: 'LEILA RODRIGUES',                            fone: '',                 celular: '(61) 98635-5979' },
  { nome: 'JOSIMARY FONSECA DA SILVA',                  fone: '',                 celular: '(61) 99413-3923' },
  { nome: 'EMILLY VICTORIA DOS SANTOS',                 fone: '',                 celular: '(61) 99437-0912' },

  // Página 12
  { nome: 'REGINA CÉLIA MOURA',                         fone: '',                 celular: '(61) 98400-0816' },
  { nome: 'GEOVANNA ALXO',                              fone: '',                 celular: '(61) 99288-7202' },
  { nome: 'ROGERIA DAVID',                              fone: '',                 celular: '619984738406' },
  { nome: 'JULIANA NUNES DE LIMA',                      fone: '',                 celular: '(61) 98282-9727' },
  { nome: 'ANDREA AMORIM',                              fone: '(61) 99561-5091',  celular: '(61) 99561-5091' },
  { nome: 'JANINE DE SOUZA GUIMARES',                   fone: '(61) 98277-7106',  celular: '' },
  { nome: 'VANCLEIA DE ANDRADE FLORÊNCIO',              fone: '(61) 98530-1662',  celular: '' },
  { nome: 'ANA BEATRIZ SIQUEIRA PEREIRA',               fone: '(61) 98597-9230',  celular: '' },
  { nome: 'KAROLINE MAIA DA SILVA',                     fone: '(61) 99246-1377',  celular: '' },
  { nome: 'DANIELLY AGUIAR DE BRITO',                   fone: '',                 celular: '(61) 98448-4246' },
  { nome: 'KAMILA DA SILVA CASTRO',                     fone: '',                 celular: '(61) 99875-2386' },
  { nome: 'JANETE ALVES DE ALMDEIRA',                   fone: '',                 celular: '61982940059' },
  { nome: 'CARINA SALES',                               fone: '',                 celular: '61983740247' },
  { nome: 'LUISA ROCHA',                                fone: '(61) 98505-9707',  celular: '' },
  { nome: 'KASSIANA ALVES',                             fone: '',                 celular: '(61) 99310-6117' },
  { nome: 'ANA FLAVIA FERREIRA DE ANDRADE',             fone: '',                 celular: '61981588241' },
  { nome: 'RENATA FERREIRA FORMIGA',                    fone: '',                 celular: '619981202434' },
  { nome: 'FRANCISCA DARCI',                            fone: '',                 celular: '61991078609' },
  { nome: 'LETICIA VELOSO',                             fone: '',                 celular: '(61) 99297-7705' },
  { nome: 'JOZANIRA SILA (JOZY)',                       fone: '(61) 98442-2868',  celular: '' },
  { nome: 'SAND NAILS SUDOESTE',                        fone: '',                 celular: '(61) 98109-0087' },
  { nome: 'ELNA ARAUJO',                                fone: '',                 celular: '6191437960' },
  { nome: 'SULLA LIMA',                                 fone: '',                 celular: '(61) 9296-8578' },
  { nome: 'ADENILDA DA SILVA NEVES',                    fone: '',                 celular: '(61) 99877-0215' },
  { nome: 'JULIANA DO NASCIMENTO AMARAL',               fone: '',                 celular: '(61) 98515-6864' },
  { nome: 'YLLUSKA FERRAZ',                             fone: '',                 celular: '(61) 98118-8776' },
  { nome: 'ANA CAROLINA',                               fone: '',                 celular: '(61) 99934-6593' },
  { nome: 'CATIANE FERREIRA',                           fone: '',                 celular: '(61) 98211-7346' },
  { nome: 'CRISTIANE OECHE',                            fone: '',                 celular: '(61) 9953-6513' },

  // Página 13
  { nome: 'NARA NOGUEIRA',                              fone: '',                 celular: '(61) 99698-9372' },
  { nome: 'IZABEL CRISTINA DE LIMA TAVARES',            fone: '(61) 99555-7493',  celular: '' },
  { nome: 'CASSIA PATRICIA RODRIGUES',                  fone: '',                 celular: '(61) 98310-9034' },
  { nome: 'JANE ROCHA',                                 fone: '',                 celular: '(61) 99865-6823' },
  { nome: 'VIVIANE SIMÕES BATISTA',                     fone: '',                 celular: '(61) 99824-3831' },
  { nome: 'MARTA MARIA COSTA SILVA',                    fone: '(61) 98259-5117',  celular: '' },
  { nome: 'BEATRIZ PIMENTEL',                           fone: '',                 celular: '(96) 98107-2428' },
  { nome: 'LUANA CARVALHO PEREIRA',                     fone: '',                 celular: '61993817721' },
  { nome: 'ELINE AGUIAR',                               fone: '',                 celular: '(61) 99800-9747' },
  { nome: 'ANNY FELIX',                                 fone: '(61) 99635-8673',  celular: '' },
  { nome: 'MARIA KEILIANE PAIVA',                       fone: '(61) 99281-6201',  celular: '' },
  { nome: 'KAREN REGINA',                               fone: '',                 celular: '61994511141' },
  { nome: 'JOSELMA FREITAS',                            fone: '',                 celular: '(61) 99185-4117' },
  { nome: 'SHIRLEY SILVA',                              fone: '(61) 98285-3875',  celular: '' },
  { nome: 'MAIRA FERREIRA PARENTE',                     fone: '',                 celular: '(61) 98441-4192' },
  { nome: 'ELZAMAR REIS',                               fone: '',                 celular: '61985306595' },
  { nome: 'MARIA CRISTINA OLIVEIRA',                    fone: '',                 celular: '61992297318' },
  { nome: 'JÚLIA CRISTINA CAVALCANTI',                  fone: '',                 celular: '(61) 98305-9030' },
  { nome: 'MARIANA SANTOS',                             fone: '',                 celular: '(61) 98601-0180' },
  { nome: 'CLAUDETE MARQUES',                           fone: '',                 celular: '61992281254' },
  { nome: 'VENICIA DE SOUSA',                           fone: '(61) 98621-3411',  celular: '' },
  { nome: 'PATRICIA DENIA XAVIER',                      fone: '(61) 98455-2432',  celular: '' },
  { nome: 'LUZIA MARIA',                                fone: '',                 celular: '6199042651' },
  { nome: 'QUEILA RUTE',                                fone: '(61) 99585-3589',  celular: '' },
  { nome: 'JOSIANE LIMA',                               fone: '',                 celular: '(61) 99333-2206' },
  { nome: 'VICTORIA DOS SANTOS RUFINO',                 fone: '',                 celular: '61985466682' },

  // Página 14
  { nome: 'BIANCA ABREU',                               fone: '',                 celular: '61994510304' },
  { nome: 'LIDIANE SILVEIRA',                           fone: '',                 celular: '(62) 99988-8050' },
  { nome: 'ISABELA PORTO',                              fone: '',                 celular: '61996044090' },
  { nome: 'MICHELE ALVES FARIAS',                       fone: '',                 celular: '(61) 98110-3495' },
  { nome: 'EVELYN KAROLINE ARRUDA DANTAS',              fone: '',                 celular: '(91) 99347-8683' },
  { nome: 'TAMIRES DA CONCEIÇÃO SOUSA',                 fone: '',                 celular: '(61) 99872-6662' },
  { nome: 'CLEONICE JESUS DE SOUZA',                    fone: '',                 celular: '61996110366' },
  { nome: 'SULAMITA SOARES',                            fone: '',                 celular: '(61) 99962-0263' },
  { nome: 'LETICIA VIELHENA',                           fone: '',                 celular: '(61) 98401-6312' },
  { nome: 'MÉDIA CEZARIO BOAVENTURA',                   fone: '',                 celular: '(61) 98664-9458' },
  { nome: 'RAIMUNDA ARNAUD DE CASTRO',                  fone: '',                 celular: '(61) 98429-3029' },
  { nome: 'KAROLINA PEREIRA DOS ANJOS',                 fone: '',                 celular: '(61) 99168-3100' },
  { nome: 'ROSELY PEREIRA',                             fone: '',                 celular: '(61) 98567-7167' },
  { nome: 'CRISTIANE MARCIANA',                         fone: '',                 celular: '61985774215' },
  { nome: 'ELISANGELA BANDEIRA',                        fone: '',                 celular: '61992294664' },
  { nome: 'MARIA ELIANI SILVA AGUIAR TRINDADE',         fone: '',                 celular: '61998009747' },
  { nome: 'SORAYA DA SILVA PEREIRA',                    fone: '',                 celular: '(61) 99942-6122' },
  { nome: 'Michelly Novato Melo',                       fone: '(61) 9919-2019',   celular: '' },
  { nome: 'POTIRA LIMA MENDES',                         fone: '(61) 99206-2188',  celular: '' },
  { nome: 'NAYARA RODRIGUES',                           fone: '(61) 99556-3427',  celular: '' },
  { nome: 'HELLEN SUEME BRITO OLIVEIRA',                fone: '',                 celular: '(61) 99615-5544' },
  { nome: 'ANA CELIA',                                  fone: '',                 celular: '(61) 99856-6209' },
  { nome: 'PATRICIA PEGORER',                           fone: '',                 celular: '31993943646' },
  { nome: 'MARISA PEREIRA',                             fone: '',                 celular: '61985651321' },
  { nome: 'DEBORA FERNANDA DE ABREU AMADO CHAVES',      fone: '',                 celular: '71993314221' },
  { nome: 'JOYCE MUNIZ',                                fone: '',                 celular: '(61) 98143-7775' },
  { nome: 'RAIMUNDA DINIZ DO NASCIMENTO',               fone: '',                 celular: '(61) 98351-0871' },
  { nome: 'MARA RUBIA LIMA',                            fone: '',                 celular: '61985276783' },

  // Página 15
  { nome: 'SIMONE BARBOSA DA SILVA',                    fone: '',                 celular: '(61) 98146-0996' },
  { nome: 'RAISSA ROCHA',                               fone: '',                 celular: '(61) 99226-7526' },
  { nome: 'RENATA SOUZA',                               fone: '',                 celular: '61998108412' },
  { nome: 'RAFAELA LEAL LIMA',                          fone: '',                 celular: '6191316234' },
  { nome: 'JULIANA PAPEIRA',                            fone: '(61) 99618-6538',  celular: '' },
  { nome: 'SENIA SOUTO',                                fone: '(61) 99607-6650',  celular: '' },
  { nome: 'TALIA PEREIRA CASTRO',                       fone: '',                 celular: '(61) 99452-1596' },
  { nome: 'ALINE GONÇALVES',                            fone: '',                 celular: '(61) 99801-8857' },
  { nome: 'EMILY VICTORIA',                             fone: '',                 celular: '(61) 99437-0912' },
  { nome: 'KEILA BORGES',                               fone: '',                 celular: '(61) 98403-6969' },
  { nome: 'THAINÁ EVANGELISTA',                         fone: '',                 celular: '(61) 98236-7335' },
  { nome: 'BRUNA RIBEIRO',                              fone: '(61) 98274-4933',  celular: '' },
  { nome: 'YARA GRAZIELE',                              fone: '',                 celular: '(61) 98581-9600' },
  { nome: 'MARIA DE FATIMA PEREIRA MAIA',               fone: '',                 celular: '61991495501' },
  { nome: 'LILIANE BRAZ DE MORAIS',                     fone: '',                 celular: '61984139547' },
  { nome: 'ANA JOICE GOMES DO SANTOS',                  fone: '',                 celular: '61981514772' },
  { nome: 'ELIENE DE PAIVA AMORIM',                     fone: '',                 celular: '(61) 99289-4524' },
  { nome: 'NUDE ESMALTERIA',                            fone: '',                 celular: '(61) 99236-1578' },
  { nome: 'JACIARA DE OLIVEIRA',                        fone: '',                 celular: '(11) 97189-0416' },
  { nome: 'MARIA APARECIDA BENÍCIO',                    fone: '',                 celular: '(61) 98120-0771' },
  { nome: 'IVONE MATOS SOBRINHO',                       fone: '',                 celular: '61982571447' },
  { nome: 'CAMILA SARKIS LEITE',                        fone: '',                 celular: '61981953771' },
  { nome: 'GABRIELA BONFIM',                            fone: '(61) 99113-1974',  celular: '(61) 98509-5775' },
  { nome: 'SARAH LUCIA DE MENEZES',                     fone: '',                 celular: '62991415433' },
  { nome: 'CAROLINE SOUZA LEITE',                       fone: '',                 celular: '(61) 99313-9690' },
  { nome: 'LUDMILA BARBOSA',                            fone: '',                 celular: '(61) 98441-8413' },

  // Página 16
  { nome: 'MICHELE FERNANDES',                          fone: '',                 celular: '(61) 99318-1197' },
  { nome: 'AILIME CARDOSO',                             fone: '(61) 98197-6042',  celular: '' },
  { nome: 'LUCIANE OLIVEIRA',                           fone: '',                 celular: '(61) 98533-0644' },
  { nome: 'NADJA FERREIRA DA SILVA',                    fone: '',                 celular: '(61) 99672-9815' },
  { nome: 'MARIA GILVA',                                fone: '',                 celular: '(61) 99185-3701' },
  { nome: 'NAIANA BARBOSA SANTOS',                      fone: '(63) 98150-6954',  celular: '' },
  { nome: 'TEREZA CRISTINA',                            fone: '',                 celular: '(61) 99959-1676' },
  { nome: 'DAYANE',                                     fone: '',                 celular: '(61) 98471-7130' },
  { nome: 'KATIA MORI',                                 fone: '',                 celular: '(61) 99954-2821' },
  { nome: 'GABRIELLA NASCIMENTO',                       fone: '',                 celular: '(61) 99952-6128' },
  { nome: 'VAGNA MATOS',                                fone: '',                 celular: '(61) 98622-9725' },
  { nome: 'THAYNARA BARBOSA',                           fone: '',                 celular: '(61) 99927-8426' },
  { nome: 'ESSENZA CONCEPT HAIR',                       fone: '',                 celular: '(61) 99838-0723' },
  { nome: 'GEISELE BATISTA DE ARAUJO',                  fone: '',                 celular: '(61) 99139-8884' },
  { nome: 'POLIANA CALAZANS',                           fone: '(61) 98123-9882',  celular: '' },
  { nome: 'AKEMI YOKOZAWA',                             fone: '',                 celular: '(61) 98522-1308' },
  { nome: 'GISELI MARIA PESSOA DA SILVA',               fone: '',                 celular: '(61) 98301-3869' },
  { nome: 'ILMA FONSECA',                               fone: '',                 celular: '(61) 99201-6644' },
  { nome: 'RAQUEL TEIXEIRA',                            fone: '',                 celular: '(61) 98204-1010' },
  { nome: 'SAMARA SOUSA CARVALHO',                      fone: '',                 celular: '(61) 99916-3449' },
  { nome: 'MARIA EDUARDA ROSA',                         fone: '(61) 9890-2852',   celular: '' },
  { nome: 'CRISTIANE GOES',                             fone: '',                 celular: '61985106644' },
  { nome: 'LOHAN MAX DE ARAUJO',                        fone: '',                 celular: '(61) 99143-4268' },
  { nome: 'SAMARA MIQUELINO',                           fone: '',                 celular: '61982039288' },
  { nome: 'LÍBIA FRANCISCO DA SILVA',                   fone: '',                 celular: '(61) 99451-1141' },
  { nome: 'LAISA MARTINI',                              fone: '',                 celular: '61981712481' },

  // Página 17
  { nome: 'GABRIELLE ARRUDA BASTOS',                    fone: '',                 celular: '(61) 98260-2832' },
  { nome: 'CLEANE DO SANTOS COSTA',                     fone: '(61) 99100-6321',  celular: '' },
  { nome: 'THAISA MOREIRA',                             fone: '',                 celular: '61996809096' },
  { nome: 'FRANCISCA DE LURDES',                        fone: '',                 celular: '(61) 98435-1497' },
  { nome: 'NIOMAR CRISTINA WANDERLEY',                  fone: '',                 celular: '(61) 9856-4456' },
  { nome: 'VANESSA HELENA DA SILVA',                    fone: '',                 celular: '(61) 99819-6913' },
  { nome: 'GEOVANA NEVES BRAGA',                        fone: '(61) 98577-7179',  celular: '' },
  { nome: 'DANIELA GUEDES SILVA',                       fone: '',                 celular: '61984054045' },
  { nome: 'THAIS BRANDAO REZENDE',                      fone: '',                 celular: '61981864354' },
  { nome: 'ALINE ROCHA',                                fone: '',                 celular: '(61) 99924-0730' },
  { nome: 'ANA LETÍCIA GALDINO',                        fone: '',                 celular: '(61) 99133-2401' },
  { nome: 'LUZIA MARINHO',                              fone: '',                 celular: '(61) 99904-2651' },
  { nome: 'WILLYANE SILVA NASCIMENTO',                  fone: '',                 celular: '(61) 99244-5973' },
  { nome: 'FLÁVIA ARAUJO DE MELO',                      fone: '',                 celular: '(61) 99116-9438' },
  { nome: 'FERNANDA ARAUJO DE MELO',                    fone: '',                 celular: '(61) 98414-0771' },
  { nome: 'Lucileia gomes silva',                       fone: '',                 celular: '(61) 99248-5586' },
  { nome: 'DANIELE BIDIN',                              fone: '',                 celular: '(61) 99838-2470' },
  { nome: 'NICOLE DOS SANTOS',                          fone: '',                 celular: '61993697771' },
];

// ── Deduplicação por nome + merge de telefones ─────────────────────────────────
const normName = s => (s||'').normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase().replace(/\s+/g,' ').trim();

const byName = {};
for (const c of RAW) {
  const key = normName(c.nome);
  if (!byName[key]) byName[key] = { nome: c.nome.trim(), phones: [] };
  if (c.celular.trim()) byName[key].phones.push(c.celular.trim());
  if (c.fone.trim())    byName[key].phones.push(c.fone.trim());
}

// ── Upsert no Supabase ─────────────────────────────────────────────────────────
async function run() {
  const supabase = getSupabase();
  const agora    = new Date().toISOString();
  const rows     = [];

  for (const { nome, phones } of Object.values(byName)) {
    const telefones = normalizePhones(phones);
    if (!telefones.length) continue; // sem telefone válido — ignora

    rows.push({
      nome,
      celular:       telefones[0],
      telefone:      telefones[1] || telefones[0],
      telefones,
      atualizado_em: agora,
    });
  }

  console.log(`\nImportando ${rows.length} contatos da planilha → Supabase...\n`);

  // Exemplos de contatos com 2 números (para confirmar a lógica)
  const dois = rows.filter(r => r.telefones.length >= 2);
  console.log(`  → Com 2+ números: ${dois.length}`);
  dois.slice(0, 5).forEach(r =>
    console.log(`     ${r.nome}: [${r.telefones.join(', ')}]`)
  );

  // Upsert em lotes — atualiza apenas os campos de telefone, preserva dados financeiros
  let importados = 0, erros = 0;
  for (let i = 0; i < rows.length; i += 200) {
    const { error } = await supabase
      .from('crm_clientes')
      .upsert(rows.slice(i, i + 200), { onConflict: 'nome' });
    if (error) {
      console.error(`  Erro lote ${Math.floor(i/200)+1}:`, error.message);
      erros++;
    } else {
      importados += rows.slice(i, i + 200).length;
    }
  }

  console.log(`\n✓ ${importados} contatos importados | ${erros} lotes com erro`);
  console.log('  Os dados financeiros (qtd_pedidos, ticket_medio, etc.) foram preservados.\n');
}

run().catch(e => { console.error('Erro fatal:', e.message); process.exit(1); });
