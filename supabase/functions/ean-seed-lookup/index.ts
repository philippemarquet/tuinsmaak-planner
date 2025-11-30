import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');

// Crop type mapping naar database IDs
const cropTypeMap: Record<string, string> = {
  "Aardappel": "026e50d2-e7f9-4953-894e-fe6f67a27b07",
  "Alium": "2daf96a8-a80d-4904-a6c9-4da3d53eea05",
  "Blad": "3cf5145d-58c0-4e75-9ac5-e838cbedea52",
  "Doorlevende": "b3e7c67b-d5bb-4775-8d30-e25e8951a90c",
  "Kool": "d7024a7e-0959-4a47-9324-b7891cbfbec4",
  "Kruid": "e44ed5a6-24f7-4414-ac30-2a0cd0dfac17",
  "Peul": "e737f633-7487-491b-9d69-f58d35b6832f",
  "Vrucht": "ecffac63-bfdb-4fd9-8c18-3a89fdc5b961",
  "Wortel": "f262b9de-e918-43d3-a323-df51f98510e4"
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { ean } = await req.json();
    
    if (!ean) {
      return new Response(
        JSON.stringify({ found: false, message: 'EAN code is vereist' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[EAN Lookup] Zoeken naar EAN: ${ean}`);

    // Stap 1: Zoek naar relevante productpagina's
    const directSearchQuery = `"${ean}" site:debolster.nl OR site:vreeken.nl OR site:fermedesaintemarthe.com OR site:graines-baumaux.fr OR site:kokopelli-semences.fr`;
    
    const searchResponse = await fetch(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(directSearchQuery)}`);
    const searchHtml = await searchResponse.text();
    
    console.log('[EAN Lookup] Search resultaten lengte:', searchHtml.length);

    // Stap 2: Extract eerste relevante product URL uit search results
    const urlRegex = /href="(https?:\/\/(?:www\.)?(debolster\.nl|vreeken\.nl|fermedesaintemarthe\.com|graines-baumaux\.fr|kokopelli-semences\.fr)[^"]+)"/g;
    const urls: string[] = [];
    let match;
    
    while ((match = urlRegex.exec(searchHtml)) !== null && urls.length < 3) {
      const url = match[1];
      // Filter out non-product pages
      if (!url.includes('/cart') && !url.includes('/checkout') && !url.includes('/account')) {
        urls.push(url);
      }
    }

    console.log('[EAN Lookup] Gevonden URLs:', urls.length);

    // Stap 3: Haal volledige productpagina op
    let productHtml = '';
    let productUrl = '';
    
    if (urls.length > 0) {
      productUrl = urls[0];
      console.log('[EAN Lookup] Fetching product page:', productUrl);
      
      try {
        const productResponse = await fetch(productUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
          }
        });
        productHtml = await productResponse.text();
        console.log('[EAN Lookup] Product page lengte:', productHtml.length);
      } catch (err) {
        console.error('[EAN Lookup] Fout bij ophalen productpagina:', err);
        // Fallback naar search results
        productHtml = searchHtml;
      }
    } else {
      // Geen directe URLs gevonden, gebruik search results
      productHtml = searchHtml;
    }
    
    // Gebruik Lovable AI om gestructureerde data te extraheren
    const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          {
            role: 'system',
            content: `Je bent een expert in het extraheren van zaad/seed informatie van Nederlandse en Franse websites zoals De Bolster, Vreeken's, Ferme de Sainte Marthe, Graines Baumaux en Kokopelli.

Je krijgt HTML zoekresultaten van zoekmachines. Zoek naar:
- Productnaam (vaak in titles, headers, of product links)
- EAN/barcode referenties
- Zaai- en oogstinformatie
- Plantafstanden
- Productbeschrijvingen

BELANGRIJK - Gewastypes mapping (gebruik EXACT deze namen):
- Aardappel (aardappelen)
- Alium (uien, look, sjalotten, prei)
- Blad (sla, spinazie, bladgroenten)
- Doorlevende (asperges, artisjok, rabarber)
- Kool (alle koolsoorten)
- Kruid (kruiden)
- Peul (bonen, erwten, doperwten, stokbonen, stokslabonen)
- Vrucht (tomaten, paprika's, komkommers, courgettes, pompoenen, meloenen)
- Wortel (wortels, radijs, knolselderij, pastinaak)

Maanden: gebruik getallen 1-12 (januari=1, december=12).

BELANGRIJK: 
- Als je een productnaam vindt (zelfs een gedeeltelijke), gebruik die voor het name veld
- Gebruik null (niet "null" als string, niet "Onbekend") als je echt geen naam vindt
- Wees creatief in het interpreteren van fragmentarische informatie
- Zoek naar zaadnamen in link teksten, titles, en snippets

Extraheer ALLEEN informatie die je daadwerkelijk vindt in de zoekresultaten. Gebruik null voor onbekende velden.

BELANGRIJK: Als je geen zaadnaam kunt vinden, gebruik dan null voor het name veld (niet "Onbekend" of "null" als tekst).`
          },
          {
            role: 'user',
            content: `${productUrl ? `Volledige productpagina van ${productUrl}` : 'Zoekresultaten'} voor EAN ${ean}. 

Analyseer deze HTML en extraheer alle beschikbare zaad informatie:
- Productnaam (vaak in <h1>, <title>, of product headers)
- EAN/barcode referenties
- Zaai- en oogstmaanden (zoek naar maandnamen of cijfers 1-12)
- Plantafstanden (cm)
- Productbeschrijvingen met teeltinformatie

HTML content (eerste 8000 karakters):
${productHtml.slice(0, 8000)}

Extraheer alle bruikbare informatie. Gebruik gedeeltelijke namen als dat het beste is wat je kan vinden.`
          }
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "extract_seed_info",
              description: "Extraheer gestructureerde zaad informatie",
              parameters: {
                type: "object",
                properties: {
                  name: { type: "string", description: "Naam van het zaad" },
                  crop_type: { 
                    type: "string", 
                    enum: ["Aardappel", "Alium", "Blad", "Doorlevende", "Kool", "Kruid", "Peul", "Vrucht", "Wortel"],
                    description: "Gewastype - gebruik EXACT een van deze namen"
                  },
                  sowing_type: { 
                    type: "string", 
                    enum: ["direct", "presow"],
                    description: "direct = direct zaaien, presow = voorzaaien"
                  },
                  presow_months: { 
                    type: "array", 
                    items: { type: "integer", minimum: 1, maximum: 12 },
                    description: "Maanden voor voorzaaien (binnen/kas)"
                  },
                  direct_plant_months: { 
                    type: "array", 
                    items: { type: "integer", minimum: 1, maximum: 12 },
                    description: "Maanden voor direct zaaien buiten"
                  },
                  greenhouse_months: { 
                    type: "array", 
                    items: { type: "integer", minimum: 1, maximum: 12 },
                    description: "Maanden voor kas"
                  },
                  harvest_months: { 
                    type: "array", 
                    items: { type: "integer", minimum: 1, maximum: 12 },
                    description: "Oogstmaanden"
                  },
                  presow_duration_weeks: { type: "integer", description: "Voorzaaiduur in weken" },
                  grow_duration_weeks: { type: "integer", description: "Groeiduur in weken vanaf planten" },
                  harvest_duration_weeks: { type: "integer", description: "Oogstduur in weken" },
                  plant_spacing_cm: { type: "integer", description: "Plantafstand in cm" },
                  row_spacing_cm: { type: "integer", description: "Rijafstand in cm" },
                  greenhouse_compatible: { type: "boolean", description: "Geschikt voor kas" },
                  notes: { type: "string", description: "Extra informatie, variëteit, beschrijving" }
                },
                required: ["name"],
                additionalProperties: false
              }
            }
          }
        ],
        tool_choice: { type: "function", function: { name: "extract_seed_info" } }
      })
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error('[EAN Lookup] AI Error:', aiResponse.status, errorText);
      
      if (aiResponse.status === 429) {
        return new Response(
          JSON.stringify({ found: false, message: 'Even geduld, probeer het over een minuut opnieuw (rate limit)' }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      if (aiResponse.status === 402) {
        return new Response(
          JSON.stringify({ found: false, message: 'AI credits op - neem contact op met support' }),
          { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      return new Response(
        JSON.stringify({ found: false, message: 'AI service niet beschikbaar' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const aiData = await aiResponse.json();
    const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
    
    if (!toolCall) {
      console.log('[EAN Lookup] Geen gestructureerde data gevonden');
      return new Response(
        JSON.stringify({ found: false, message: `Geen informatie gevonden voor EAN ${ean}` }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const extractedData = JSON.parse(toolCall.function.arguments);
    console.log('[EAN Lookup] Gevonden data:', extractedData);

    // Check of er daadwerkelijk zinvolle data is gevonden
    const hasValidName = extractedData.name && 
                         extractedData.name.toLowerCase() !== 'onbekend' && 
                         extractedData.name.toLowerCase() !== 'unknown' &&
                         extractedData.name.toLowerCase() !== 'null' &&
                         extractedData.name !== 'null' &&
                         !extractedData.name.toLowerCase().includes('geen informatie');
    
    const hasNoDataMessage = extractedData.notes && (
      extractedData.notes.toLowerCase().includes('geen') ||
      extractedData.notes.toLowerCase().includes('niet gevonden') ||
      extractedData.notes.toLowerCase().includes('no data')
    );

    // Als er geen valide naam is OF als de notes aangeven dat er niets gevonden is
    if (!hasValidName || hasNoDataMessage) {
      console.log('[EAN Lookup] Geen bruikbare data gevonden');
      return new Response(
        JSON.stringify({ found: false, message: `Geen informatie gevonden voor EAN ${ean}` }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Map crop_type naar database ID
    if (extractedData.crop_type && cropTypeMap[extractedData.crop_type]) {
      extractedData.crop_type_id = cropTypeMap[extractedData.crop_type];
      delete extractedData.crop_type;
    }

    return new Response(
      JSON.stringify({ found: true, data: extractedData }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[EAN Lookup] Error:', error);
    return new Response(
      JSON.stringify({ 
        found: false, 
        message: 'Er ging iets mis bij het zoeken. Probeer het opnieuw of vul handmatig in.' 
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
