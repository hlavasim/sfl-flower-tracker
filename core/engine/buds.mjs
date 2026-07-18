// Bud NFT valuation — extracted VERBATIM from flowers.html (ranges marked) for
// core/sections/buds.mjs. The BUD_*_ENC strings encode all 2621 minted buds'
// type/stem/aura. describeBudBoosts stays inline (it renders catIcon HTML). DOM-free.
import {
  CROP_TIERS, POWER_CATEGORIES, SEED_DATA,
  isAnimalCat, getAnimalData,
  getCycleSec, getCapacityCount, getDefaultProduct, getBaseYield,
} from "./power-helpers.mjs";

    // ── flowers.html 4640-4691: BUD tables + ENC data + decodeBud ──
    const BUD_TYPE_BOOSTS = {
      "Plaza":     [{ cats: ["crops"], cropTier: "basic", value: 0.3, type: "yield_flat" }],
      "Castle":    [{ cats: ["crops"], cropTier: "medium", value: 0.3, type: "yield_flat" }],
      "Snow":      [{ cats: ["crops"], cropTier: "advanced", value: 0.3, type: "yield_flat" }],
      "Woodlands": [{ cats: ["trees"], value: 0.2, type: "yield_flat" }],
      // "Cave" → minerals only. Per sunflower-land/lib/getBudYieldBoosts.ts
      // `isMineral` = Stone | Iron | Gold (NOT crimstone), so we exclude crimstone here.
      "Cave":      [{ cats: ["stone", "iron", "gold"], value: 0.2, type: "yield_flat" }],
      "Retreat":   [{ cats: ["chickens", "cows", "sheep"], value: 0.2, type: "yield_flat" }],
      "Beach":     [{ cats: ["fruits"], value: 0.2, type: "yield_flat" }],
      "Saphiro":   [{ cats: ["crops"], value: -10, type: "speed_pct" }],
      "Sea":       [{ cats: ["fishing"], pct: 10, extra: 1, type: "chance" }],
      "Port":      [], // +10% Fish XP only (non-monetary)
    };
    const BUD_STEM_BOOSTS = {
      "3 Leaf Clover":  [{ cats: ["crops"], value: 0.5, type: "yield_flat" }],
      "Acorn Hat":      [{ cats: ["trees"], value: 0.1, type: "yield_flat" }],
      "Apple Head":     [{ cats: ["fruits"], value: 0.2, type: "yield_flat" }],
      "Banana":         [{ cats: ["fruits"], value: 0.2, type: "yield_flat" }],
      "Basic Leaf":     [{ cats: ["crops"], cropTier: "basic", value: 0.2, type: "yield_flat" }],
      "Carrot Head":    [{ cats: ["crops"], product: "Carrot", value: 0.3, type: "yield_flat" }],
      // "Diamond Gem" stem → minerals only (same isMineral definition as Cave bud).
      "Diamond Gem":    [{ cats: ["stone", "iron", "gold"], value: 0.2, type: "yield_flat" }],
      "Egg Head":       [{ cats: ["chickens"], product: "Egg", value: 0.2, type: "yield_flat" }],
      "Fish Hat":       [{ cats: ["fishing"], pct: 10, extra: 1, type: "chance" }],
      "Gold Gem":       [{ cats: ["gold"], value: 0.2, type: "yield_flat" }],
      "Magic Mushroom": [{ cats: ["mushrooms"], value: 0.2, type: "yield_flat" }],
      "Miner Hat":      [{ cats: ["iron"], value: 0.2, type: "yield_flat" }],
      "Mushroom":       [{ cats: ["mushrooms"], value: 0.3, type: "yield_flat" }],
      "Ruby Gem":       [{ cats: ["stone"], value: 0.2, type: "yield_flat" }],
      "Sunflower Hat":  [{ cats: ["crops"], product: "Sunflower", value: 0.5, type: "yield_flat" }],
      "Tree Hat":       [{ cats: ["trees"], value: 0.2, type: "yield_flat" }],
    };
    const BUD_AURA_MULTIPLIERS = { "No Aura": 1, "Basic": 1.05, "Green": 1.2, "Rare": 2, "Mythical": 5 };

    // ── Hardcoded bud data (2,621 NFTs, never changes) ──
    const BUD_COUNT = 2621;
    const BUD_TYPE_NAMES = ["Beach","Castle","Cave","Plaza","Port","Retreat","Saphiro","Sea","Snow","Woodlands"];
    const BUD_STEM_NAMES = ["3 Leaf Clover","Acorn Hat","Apple Head","Axe Head","Banana","Basic Leaf","Carrot Head","Diamond Gem","Egg Head","Fish Hat","Gold Gem","Hibiscus","Magic Mushroom","Miner Hat","Mushroom","Rainbow Horn","Red Bow","Ruby Gem","Seashell","Silver Horn","Sunflower Hat","Sunflower Headband","Sunshield Foliage","Tender Coral","Tree Hat"];
    const BUD_AURA_NAMES = ["No Aura","Basic","Green","Rare","Mythical"];
    const BUD_TYPES_ENC = "66437663288399648642954165595695238181989364964338308918839080720217921906361312374745302734796685535964198940123885797739080989377504891438453746781274152788794581745850855822811844494297502621612841188079966519558341393927440901161925384124071975504230076556543868255410706573658265137126366483954451844240985066268217235027237343368282690597790796108852142387212419443398222568049324317739491399959331962911342411552504704468092880210708925172194970567608704346316238674298295421449667765652581736985864385749043736605646721188178796663799939759403109069299911076400912397942849785036701857800924136961697052701016851622871919588797420435485837724874237415468269312618077015374761447810338752613913748309778113670930819947375930362976254828338025771556314263136269004620764149895524892198427896942621067197685088650600821374900707927681241634793295162828178657288485297746093043267416956069248907206414972540126169322722226701224104880237578082114353649556247022845215644842439874481810269742121650383270172040119654897966002600465556443683369129799557207230595491835564189596193815907772052448219902571121606088479955721607454817456093321824765063446256143324660755532283616374382405804081810496665413685277868099943942063707472733712152536798892347045320162139695201780516785109689920388670863905086312946979124970400526044240191385945760143629929788522854181571055639557861110051346240259858680073065357867089742486621407483561599017952874516637337759972518179600603688882494325026044243556643714372504647001729637464484802197716393440338971759228690510642252602837154719163029109762308393479234287117565251932582554595519553209473829899747271112289549526026583660918482436961356620842045168112082021975320333227481058121366598754467693464520083847705788179017235050242189817415686034190486036745248354729565961758653194782092459616024845657566485873198056933445394513395621305679100111552536845752304222934807074641661950357820866435308406936450429766916566335412305299111313933548896505319717881322005765619966906347819231716971107629764904441059932246148063315740783580680425086116313421368541523190560675387981279423123510901377477275651577193624205374204101530958075005503869907045930901013060620969267716363943089895326138834789861190165999686278284245534803020037005499494867893226252657511361096850754329803169705386773414966779898111937265845748640880479611523366579555004739624128998664490164445121551940890759624541748553980578880580386414258583037659989959290944530052153034360056068935651703480758471308445330447593342330911756633023509235798954391302853545766067608245615927640565105260311509220940673";
    const BUD_STEMS_ENC = "mf2odlinjl53jfiaffojglnll7e5ggdlgon2blgj3dm3j2njil0nl2oh44hdk7job8bb4iblolfjo3ffbajbjbl3fonlil3gi4l3i8gl35njgegcnfnn8lnn4dam1be6l9j4bfmkbf1f3ib22g5bb3cml33cjffhnhjbg0db3oibjijjkddi8cglbggn0335bl3mnf3lm8jf1fdmbj2jj4nnlbjonllkkjid6g1o2kgmjjoibfblic8lll469iha6hf2c1i8j88b8f83ff8ig3con6m3mi5n2g3m4lhnjlgfjlfll3lglgg4k24gmo3fj1b17dfofg63fo28ndlchmb9labniei6efi8gnbg473h1f2j1jnib2b9odjn4l3fioei32m8mlgaom434d5g1m1h285nm4fj4gja1jfnnb5i2879fliigc4k32njniib17f0a3nm8fo8gn7no34nicbjoogflmij5jdi4oei2ni4ogofb3eecn3l3bbbiboj7kjbjj7lnn559oi62kdf8fafgjamfn2j2lii33fmlmh28bkmofkf2boc62lj33j8n4ii06f33fainbif1fge8fje1g3jinfiffhkb9fljieninmh4m2ggm1f4a0bmo1lin99n533dlilnibbb3nf9ib68mdc1mjiglni2ajabbjabd3a4n4n33blnk3inagblll7gbonnmngbnm7f4lff37bai8bkjg868eg2noil8gl3hlnl89333bblfg94g0jjkmjfbj4jc1jiccfjbl4hn2egd6bnjiff8ecbbci1glgbnjab2bj440g9mocag1fjjmi08mnijcmbolmmgc4li8jajildjajlmb3l17bgml4fa858b6cn42ik7ajn1l7nhmjf8if4fbgi3o6ibg1j6kbblgink0ggfelfb88lobbml3iib6ge66jejkgngilljmfaiffai3m8mb0l3fogmnc1nj8nhbjk21d8ii5nmbgljfmmh5mjf8e7mo351effgjlmjf2dohgn6b6m4m83c84n8jgjjeb1j8lffjn3mna4fb68mnn5njjgnj2lfo6eb3mllndglghibgm3ll63igneoo22f48e3enib1onf5bbnofbk22g1f33fi1jf3fgnin2mi2omon634b32dllne2b3n1lng78bn0ll3mfgimjbgdnlkcnjifbfdof0mofojll45cfinfi8gnem4jnlmb0jhmo4n2gj87emffhgablifmon3lnh4n55fd3fh4c3igb42mje3fnl8bmodbheobfnjijgclf4fa1k4nodilind4nmi44oc2i3eknj39g376ddimj02ibgfl3aii38nij6i1mi0ginlof2lk9jfmi11nhg83442b3c3n0g68bgb7ghbl8nfmlb3hlkfono73le4d4g4ijj2fo68hinlo7g3f9ggmngo3ii12ioikj2g4ldg3m4b2gll2c6f7oknk84fibmj3d4mi3bh2inojj78a3584n3cf38mj4ffef2jfb3g5no6ij13nnclfb33imenjdn3fnbfmlngeg1n5ibkbkf8al3cfhbki8gb5mfj8jl1ngkfj13onlc24n5glbbflnbf42fjllbi832kbdmobin3f4lbho5gl4blm2mi834mnff4iggoni4lnh3f680ib34jie12bgl23nf184bolnjfm37ink33jgin56ig3gg8j9mg8dmkl2m7fg8198blgffeifgfnjingjjfglff4jgjl35no2fbg3bfmgm7l3hijmgilginmgl2m6jlmjikbem36i3jo1i7g2g7jm30418nnff255bnjf08g0nhlm3lamjf32jbm1b98330i2j97dobdm1g2omii2kd83em22jn8lb9if2jf8fgb5bi3j7li3i2e0ihiijn6mjl12fe641coil8ai1doohnjnfnglo1m4fjmg6mf3fl8oninm7gbmdb6nl3b5gbkikcibnnb2ci41b3ocmejbhja6j8gkmbmf7kln2oiif6hfhg6lijfog8ilmmflb8hfg3834i2ifg379lobml9loba3ibdii5mo37fgbjme3l5h4hodlemfjj97kndmndjf8clbb6n1bjolm5mib9an3lgkb7lg6mo7b88j1m2735nh6lfna4m76ea3ol2njhn25l3f24dll24g5jo6814abif4jjj9jblbdfnci8jd248n79gnj7n7dge2i3ggmjdi6gigj31m1f742g6nf66gf4anaomgfoho8nbaf25bbjjo3lnilhbjffik3jgb4l9lij2gcln4cbgfgie4efmj4i6bnmnniih51lfnn8ko7n2162hjd89ggb3fjl6lnk338hggooljb6dmangjn4j8l26jmhmd322nbb592o2b321g13jlo6m85khgj3mbi18oighi9janijf7mii0lbmjfng8mlgojbcli0g57n3b3f36nflomkigkekh5giilgm43jghki4abc3gml4bl8bblj893lkfaf0b8jlfm3gi8jm71n2gi1g2fmo4llf77ono24eoiingifn7ffj1llfj34n6gfiin3dkm3iam1ff";
    const BUD_AURAS_ENC = "10001110010001101104110200102000100124021100111011003000000000111141010000110201100110303011111110310201300010101001010110110200100110003010010100101011420033003200200132110110101000000412000202104110211111102202101110101210100010100001121103031100230210000001113012100101103010010031231001110100000212101011011100022100101000111110220000100101201110001010113100103300012100120021022100100000103000010001100101000100011011310112004101100100200000110000000000000210100121200011000012021111111112010112010011102120100010030000001000112000200221111000021021111201000002000021331110130101120020110110011101211110100000111001211104011103000101111010001110210112000110101001000212201200203020000010101120413000111001011101333100001200210110200320100200000000000200201100111200010120001110011100100000011110310102100201210001001012010101011120000201301113001000100113001002000001242110111101100000100000010100201101303031004111112220010113010030000021101110120100010003101121112000000220020000201131020000200202310100010101001100110101131001021100000341110000000300001111013121111111011100002100001221110111110000003020010012010003100221000112000200000140124110030000110301001002120010103200120021001110001021104011020132101010100111102100030112101103000023200010000111000111102101000111010133011020210110110120020000111000011111000101110000002010113010000001110021110020001020122011102010300210201111010001002011101000102000110200100010100000010022021200010100230021120101013000001000010100001001010110000200102111010100211122202121011201111021010100100111001112101211323000123111000010010000110101101100003321400100120001111020201010001010101110001110001000020100331011011010111012000100310100011031221001211110412200102100111111020001204001011000122012000110102303112421220020011010011010011100100001011010101104101000010111201000120311001000001111000001010410011001000102111010111201000001001001002111000100033010001201000100021010001003010210000100210001020101100010110100001120303130200110002110103111000103021111100004101020241001110000101201011000111013142210002122210300100103000110011020101000012100221012100200310110010220000003000221100001130000000000130011120100004112022120011000000100100111102010121300200000002200440312113002021011010003011100010200102001011021110000011122011011014000110120000301101101001210321101041111100003030401112000000211000020112010000000101011112101001000021000001000110100131010000003110001001010200131001000100100001113000121101040002012110120031030101120001100010010000100113000021000101000102201021100000001200010010110000011110241100421021200000121102001000101100000011211021200101";
    function decodeBud(id) {
      if (id < 1 || id > BUD_COUNT) return null;
      const i = id - 1;
      const typeIdx = parseInt(BUD_TYPES_ENC[i], 10);
      const sc = BUD_STEMS_ENC[i];
      const stemIdx = sc >= "0" && sc <= "9" ? parseInt(sc) : sc.charCodeAt(0) - 97 + 10;
      const auraIdx = parseInt(BUD_AURAS_ENC[i], 10);
      return { id, type: BUD_TYPE_NAMES[typeIdx], stem: BUD_STEM_NAMES[stemIdx], aura: BUD_AURA_NAMES[auraIdx] };
    }

    // ── flowers.html 14480-14576: budEffectApplies + calcBudSflPerDay ──
    function budEffectApplies(eff, catId, product) {
      if (!eff.cats.includes(catId)) return false;
      if (eff.cropTier && catId === "crops") {
        const tierCrops = CROP_TIERS[eff.cropTier];
        if (tierCrops && !tierCrops.includes(product)) return false;
      }
      if (eff.product && eff.product !== product) return false;
      return true;
    }

    function calcBudSflPerDay(bud, capacity, p2pPrices, savedProducts) {
      const typeEffects = BUD_TYPE_BOOSTS[bud.type] || [];
      const stemEffects = BUD_STEM_BOOSTS[bud.stem] || [];
      const aura = BUD_AURA_MULTIPLIERS[bud.aura] || 1;
      const allEffects = [...typeEffects, ...stemEffects];
      let totalSfl = 0;
      const breakdown = [];

      for (const [catId, catDef] of Object.entries(POWER_CATEGORIES)) {
        if (!catDef.quantifiable) continue;

        // Animals: iterate over all products (Egg+Feather, Milk+Leather, etc.)
        if (isAnimalCat(catId)) {
          const animal = getAnimalData(catId);
          if (!animal) continue;
          let catSfl = 0;
          for (const prod of animal.products) {
            const yieldVals = [];
            for (const eff of allEffects) {
              if (!budEffectApplies(eff, catId, prod)) continue;
              if (eff.type === "yield_flat") yieldVals.push(eff.value);
            }
            const bestYield = yieldVals.length > 0 ? Math.max(...yieldVals) * aura : 0;
            if (bestYield > 0) {
              const n = getCapacityCount(catId, capacity);
              const cycleSec = getCycleSec(catId, prod);
              const price = p2pPrices[prod] || 0;
              catSfl += bestYield * (86400 / cycleSec) * n * price;
            }
          }
          if (catSfl > 0) {
            totalSfl += catSfl;
            breakdown.push({ catId, sflPerDay: catSfl });
          }
          continue;
        }

        const product = savedProducts[catId] || getDefaultProduct(catId);
        const n = getCapacityCount(catId, capacity);
        if (n === 0 && catId !== "fishing") continue;

        const yieldVals = [], speedVals = [], chanceVals = [];
        for (const eff of allEffects) {
          if (!budEffectApplies(eff, catId, product)) continue;
          if (eff.type === "yield_flat") yieldVals.push(eff.value);
          else if (eff.type === "speed_pct") speedVals.push(eff.value);
          else if (eff.type === "chance") chanceVals.push(eff);
        }

        const bestYield = yieldVals.length > 0 ? Math.max(...yieldVals) * aura : 0;
        const bestSpeed = speedVals.length > 0 ? Math.min(...speedVals) * aura : 0;
        const bestChance = chanceVals.length > 0
          ? chanceVals.reduce((a, b) => (a.pct * a.extra > b.pct * b.extra) ? a : b) : null;

        const cycleSec = getCycleSec(catId, product);
        const priceProduct = getPriceProduct(catId, product);
        const price = p2pPrices[priceProduct] || 0;
        let extraSfl = 0;

        if (bestYield > 0) {
          if (catId === "fishing") extraSfl += bestYield * price;
          else if (catId === "bees") extraSfl += bestYield * n * price;
          else extraSfl += bestYield * (86400 / cycleSec) * n * price;
        }

        if (bestSpeed !== 0) {
          const newCycle = cycleSec * (1 + bestSpeed / 100);
          if (newCycle > 0) {
            const baseY = getBaseYield(catId);
            extraSfl += ((86400 / newCycle) - (86400 / cycleSec)) * n * baseY * price;
          }
        }

        if (bestChance) {
          const effPct = bestChance.pct * aura;
          const catches = catId === "fishing" ? 20 : (86400 / cycleSec) * n;
          extraSfl += (effPct / 100) * bestChance.extra * catches * price;
        }

        if (extraSfl > 0) {
          totalSfl += extraSfl;
          breakdown.push({ catId, sflPerDay: extraSfl, product: priceProduct });
        }
      }

      return { totalSfl, breakdown };
    }

    // ── flowers.html 15421-15429: getPriceProduct ──
    // Get the product name used for P2P price lookup
    function getPriceProduct(catId, product) {
      // For flowers, use the seed label
      if (catId === "flowers") {
        const sd = SEED_DATA[product];
        return sd ? sd.label : "Sunpetal";
      }
      return product;
    }

export {
  BUD_TYPE_BOOSTS, BUD_STEM_BOOSTS, BUD_AURA_MULTIPLIERS, BUD_COUNT,
  BUD_TYPE_NAMES, BUD_STEM_NAMES, BUD_AURA_NAMES,
  decodeBud, budEffectApplies, calcBudSflPerDay, getPriceProduct,
};
