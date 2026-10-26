window.__BENCHMARK_DATA__ = {
  "metadata": {
    "generatedAt": "2026-10-26T10:08:55.787718956Z",
    "protocol": {
      "warmup": true,
      "repetitions": 3,
      "queryRepetitions": 3
    },
    "java": "21.0.12.1",
    "os": "Linux",
    "queries": [
      "PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#> PREFIX ub: <http://www.lehigh.edu/~zhp2/2004/0401/univ-bench.owl#> SELECT ?X WHERE { ?X rdf:type ub:GraduateStudent . ?X ub:takesCourse <http://www.Department0.University0.edu/GraduateCourse0> }",
      "PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#> PREFIX ub: <http://www.lehigh.edu/~zhp2/2004/0401/univ-bench.owl#> SELECT ?X ?Y ?Z WHERE { ?X rdf:type ub:GraduateStudent . ?Y rdf:type ub:University . ?Z rdf:type ub:Department . ?X ub:memberOf ?Z . ?Z ub:subOrganizationOf ?Y . ?X ub:undergraduateDegreeFrom ?Y }",
      "PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#> PREFIX ub: <http://www.lehigh.edu/~zhp2/2004/0401/univ-bench.owl#> SELECT ?X WHERE { ?X rdf:type ub:Publication . ?X ub:publicationAuthor <http://www.Department0.University0.edu/AssistantProfessor0> }",
      "PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#> PREFIX ub: <http://www.lehigh.edu/~zhp2/2004/0401/univ-bench.owl#> SELECT ?X ?Y1 ?Y2 ?Y3 WHERE { ?X rdf:type ub:Professor . ?X ub:worksFor <http://www.Department0.University0.edu> . ?X ub:name ?Y1 . ?X ub:emailAddress ?Y2 . ?X ub:telephone ?Y3 }",
      "PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#> PREFIX ub: <http://www.lehigh.edu/~zhp2/2004/0401/univ-bench.owl#> SELECT ?X WHERE { ?X rdf:type ub:Person . ?X ub:memberOf <http://www.Department0.University0.edu> }",
      "PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#> PREFIX ub: <http://www.lehigh.edu/~zhp2/2004/0401/univ-bench.owl#> SELECT ?X WHERE { ?X rdf:type ub:Student . ?X ub:takesCourse <http://www.Department0.University0.edu/GraduateCourse0> }",
      "PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#> PREFIX ub: <http://www.lehigh.edu/~zhp2/2004/0401/univ-bench.owl#> SELECT ?X ?Y WHERE { ?X rdf:type ub:Student . ?Y rdf:type ub:Department . ?X ub:memberOf ?Y . ?Y ub:subOrganizationOf <http://www.University0.edu> . ?X ub:emailAddress ?Z }",
      "PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#> PREFIX ub: <http://www.lehigh.edu/~zhp2/2004/0401/univ-bench.owl#> SELECT ?X ?Y ?Z WHERE { ?X rdf:type ub:Student . ?Y rdf:type ub:Department . ?Z rdf:type ub:Publication . ?X ub:memberOf ?Y . ?Y ub:subOrganizationOf <http://www.University0.edu> . ?Z ub:publicationAuthor ?X }",
      "PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#> PREFIX ub: <http://www.lehigh.edu/~zhp2/2004/0401/univ-bench.owl#> SELECT ?X ?Y ?Z WHERE { ?X rdf:type ub:Student . ?Y rdf:type ub:Faculty . ?Z rdf:type ub:Course . ?X ub:advisor ?Y . ?X ub:takesCourse ?Z . ?Y ub:teacherOf ?Z }",
      "PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#> PREFIX ub: <http://www.lehigh.edu/~zhp2/2004/0401/univ-bench.owl#> SELECT ?X WHERE { ?X rdf:type ub:Student . ?X ub:takesCourse <http://www.Department0.University0.edu/GraduateCourse0> . ?X ub:takesCourse <http://www.Department0.University0.edu/GraduateCourse1> }",
      "PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#> PREFIX ub: <http://www.lehigh.edu/~zhp2/2004/0401/univ-bench.owl#> SELECT ?X WHERE { ?X rdf:type ub:ResearchGroup . ?X ub:subOrganizationOf <http://www.University0.edu> }",
      "PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#> PREFIX ub: <http://www.lehigh.edu/~zhp2/2004/0401/univ-bench.owl#> SELECT ?X ?Y WHERE { ?X rdf:type ub:Chair . ?Y rdf:type ub:Department . ?X ub:worksFor ?Y . ?Y ub:subOrganizationOf <http://www.University0.edu> }",
      "PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#> PREFIX ub: <http://www.lehigh.edu/~zhp2/2004/0401/univ-bench.owl#> SELECT ?X WHERE { ?X rdf:type ub:Person . ?X ub:hasAlumnus <http://www.University0.edu> }",
      "PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#> PREFIX ub: <http://www.lehigh.edu/~zhp2/2004/0401/univ-bench.owl#> SELECT ?X WHERE { ?X rdf:type ub:Student . ?X ub:takesCourse <http://www.Department0.University0.edu/UndergraduateCourse0> }"
    ]
  },
  "runs": [
    {
      "engine": "corese.next",
      "dataset": "dbpedia",
      "file": "category_labels_en.nt",
      "triples": 565108,
      "loadingTimeMs": 6399,
      "throughputTriplesPerSec": 88311.92373808408,
      "memoryBeforeMb": 8.447319030761719,
      "memoryAfterMb": 331.54795837402344,
      "memoryDeltaMb": 322.72203063964844,
      "cpuPercent": 8.021799407209103,
      "repetitionsMs": [
        6437,
        6399,
        6079
      ]
    },
    {
      "engine": "corese.next",
      "dataset": "dbpedia",
      "file": "disambiguations_en.nt",
      "triples": 765124,
      "loadingTimeMs": 15041,
      "throughputTriplesPerSec": 50869.22412073665,
      "memoryBeforeMb": 8.648696899414062,
      "memoryAfterMb": 287.98065185546875,
      "memoryDeltaMb": 279.3320846557617,
      "cpuPercent": 7.194970045672934,
      "repetitionsMs": [
        15181,
        15041,
        14850
      ]
    },
    {
      "engine": "corese.next",
      "dataset": "dbpedia",
      "file": "homepages_en.nt",
      "triples": 394897,
      "loadingTimeMs": 6758,
      "throughputTriplesPerSec": 58434.004143237646,
      "memoryBeforeMb": 8.648887634277344,
      "memoryAfterMb": 195.0356216430664,
      "memoryDeltaMb": 186.38673400878906,
      "cpuPercent": 7.566684812193794,
      "repetitionsMs": [
        6701,
        6783,
        6758
      ]
    },
    {
      "engine": "corese.next",
      "dataset": "dbpedia",
      "file": "persondata_en.nt",
      "triples": 356914,
      "loadingTimeMs": 1139,
      "throughputTriplesPerSec": 313357.3309920983,
      "memoryBeforeMb": 8.674880981445312,
      "memoryAfterMb": 93.93238067626953,
      "memoryDeltaMb": 85.25749969482422,
      "cpuPercent": 10.37493579866461,
      "repetitionsMs": [
        1139,
        1139,
        1129
      ]
    },
    {
      "engine": "corese.next",
      "dataset": "dbpedia",
      "file": "specific_mappingbased_properties_en.nt",
      "triples": 182530,
      "loadingTimeMs": 2883,
      "throughputTriplesPerSec": 63312.5216788068,
      "memoryBeforeMb": 8.675613403320312,
      "memoryAfterMb": 64.09549713134766,
      "memoryDeltaMb": 55.419883728027344,
      "cpuPercent": 7.788421491045399,
      "repetitionsMs": [
        2882,
        2926,
        2883
      ]
    },
    {
      "engine": "corese.4.6.5",
      "dataset": "dbpedia",
      "file": "category_labels_en.nt",
      "triples": 565108,
      "loadingTimeMs": 15248,
      "throughputTriplesPerSec": 37061.12277019937,
      "memoryBeforeMb": 7.0445098876953125,
      "memoryAfterMb": 229.95391845703125,
      "memoryDeltaMb": 222.82061004638672,
      "cpuPercent": 6.893115189768291,
      "repetitionsMs": [
        15399,
        14729,
        15248
      ]
    },
    {
      "engine": "corese.4.6.5",
      "dataset": "dbpedia",
      "file": "disambiguations_en.nt",
      "triples": 768924,
      "loadingTimeMs": 18105,
      "throughputTriplesPerSec": 42470.25683512841,
      "memoryBeforeMb": 7.245979309082031,
      "memoryAfterMb": 190.8829574584961,
      "memoryDeltaMb": 183.63697814941406,
      "cpuPercent": 6.714719930525402,
      "repetitionsMs": [
        17969,
        18118,
        18105
      ]
    },
    {
      "engine": "corese.4.6.5",
      "dataset": "dbpedia",
      "file": "homepages_en.nt",
      "triples": 394897,
      "loadingTimeMs": 8483,
      "throughputTriplesPerSec": 46551.573735706705,
      "memoryBeforeMb": 7.2461700439453125,
      "memoryAfterMb": 152.91635131835938,
      "memoryDeltaMb": 145.67018127441406,
      "cpuPercent": 7.269859478061372,
      "repetitionsMs": [
        8483,
        8460,
        8565
      ]
    },
    {
      "engine": "corese.4.6.5",
      "dataset": "dbpedia",
      "file": "persondata_en.nt",
      "triples": 356996,
      "loadingTimeMs": 8447,
      "throughputTriplesPerSec": 42263.05197111401,
      "memoryBeforeMb": 7.280876159667969,
      "memoryAfterMb": 60.043739318847656,
      "memoryDeltaMb": 52.76286315917969,
      "cpuPercent": 6.950252343186734,
      "repetitionsMs": [
        8471,
        8447,
        8301
      ]
    },
    {
      "engine": "corese.4.6.5",
      "dataset": "dbpedia",
      "file": "specific_mappingbased_properties_en.nt",
      "triples": 184083,
      "loadingTimeMs": 5485,
      "throughputTriplesPerSec": 33561.16681859617,
      "memoryBeforeMb": 7.284706115722656,
      "memoryAfterMb": 48.18318176269531,
      "memoryDeltaMb": 40.898475646972656,
      "cpuPercent": 6.976222521310005,
      "repetitionsMs": [
        5485,
        5491,
        5421
      ]
    },
    {
      "engine": "jena.6.2.0",
      "dataset": "dbpedia",
      "file": "category_labels_en.nt",
      "triples": 565108,
      "loadingTimeMs": 1641,
      "throughputTriplesPerSec": 344368.06825106643,
      "memoryBeforeMb": 40.45579528808594,
      "memoryAfterMb": 334.89598083496094,
      "memoryDeltaMb": 294.440185546875,
      "cpuPercent": 15.837104072398192,
      "repetitionsMs": [
        1682,
        1629,
        1641
      ]
    },
    {
      "engine": "jena.6.2.0",
      "dataset": "dbpedia",
      "file": "disambiguations_en.nt",
      "triples": 765124,
      "loadingTimeMs": 1587,
      "throughputTriplesPerSec": 482119.722747322,
      "memoryBeforeMb": 56.456031799316406,
      "memoryAfterMb": 243.70330047607422,
      "memoryDeltaMb": 187.2472686767578,
      "cpuPercent": 14.643931795386159,
      "repetitionsMs": [
        1587,
        1590,
        1587
      ]
    },
    {
      "engine": "jena.6.2.0",
      "dataset": "dbpedia",
      "file": "homepages_en.nt",
      "triples": 394897,
      "loadingTimeMs": 936,
      "throughputTriplesPerSec": 421898.50427350425,
      "memoryBeforeMb": 56.466033935546875,
      "memoryAfterMb": 193.2744598388672,
      "memoryDeltaMb": 136.8084259033203,
      "cpuPercent": 17.266949152542374,
      "repetitionsMs": [
        904,
        936,
        945
      ]
    },
    {
      "engine": "jena.6.2.0",
      "dataset": "dbpedia",
      "file": "persondata_en.nt",
      "triples": 356914,
      "loadingTimeMs": 760,
      "throughputTriplesPerSec": 469623.6842105263,
      "memoryBeforeMb": 56.6263427734375,
      "memoryAfterMb": 150.82150268554688,
      "memoryDeltaMb": 94.19515991210938,
      "cpuPercent": 16.129032258064516,
      "repetitionsMs": [
        760,
        765,
        755
      ]
    },
    {
      "engine": "jena.6.2.0",
      "dataset": "dbpedia",
      "file": "specific_mappingbased_properties_en.nt",
      "triples": 182530,
      "loadingTimeMs": 430,
      "throughputTriplesPerSec": 424488.37209302327,
      "memoryBeforeMb": 56.631797790527344,
      "memoryAfterMb": 117.82710266113281,
      "memoryDeltaMb": 61.19530487060547,
      "cpuPercent": 16.335078534031414,
      "repetitionsMs": [
        420,
        430,
        445
      ]
    },
    {
      "engine": "rdf4j.5.3.2",
      "dataset": "dbpedia",
      "file": "category_labels_en.nt",
      "triples": 565108,
      "loadingTimeMs": 1662,
      "throughputTriplesPerSec": 340016.8471720818,
      "memoryBeforeMb": 9.090721130371094,
      "memoryAfterMb": 534.0606002807617,
      "memoryDeltaMb": 524.9718017578125,
      "cpuPercent": 19.474585950885206,
      "repetitionsMs": [
        1657,
        1662,
        1667
      ]
    },
    {
      "engine": "rdf4j.5.3.2",
      "dataset": "dbpedia",
      "file": "disambiguations_en.nt",
      "triples": 765124,
      "loadingTimeMs": 2005,
      "throughputTriplesPerSec": 381607.98004987533,
      "memoryBeforeMb": 9.0938720703125,
      "memoryAfterMb": 538.5213851928711,
      "memoryDeltaMb": 529.4275131225586,
      "cpuPercent": 16.0427807486631,
      "repetitionsMs": [
        2005,
        1979,
        2018
      ]
    },
    {
      "engine": "rdf4j.5.3.2",
      "dataset": "dbpedia",
      "file": "homepages_en.nt",
      "triples": 394590,
      "loadingTimeMs": 3792,
      "throughputTriplesPerSec": 104058.54430379748,
      "memoryBeforeMb": 9.123634338378906,
      "memoryAfterMb": 450.8403778076172,
      "memoryDeltaMb": 441.71649169921875,
      "cpuPercent": 14.85401781776484,
      "repetitionsMs": [
        3792,
        2707,
        4151
      ]
    },
    {
      "engine": "rdf4j.5.3.2",
      "dataset": "dbpedia",
      "file": "persondata_en.nt",
      "triples": 356914,
      "loadingTimeMs": 800,
      "throughputTriplesPerSec": 446142.5,
      "memoryBeforeMb": 9.152618408203125,
      "memoryAfterMb": 101.1549301147461,
      "memoryDeltaMb": 92.00231170654297,
      "cpuPercent": 14.221652786675207,
      "repetitionsMs": [
        796,
        800,
        802
      ]
    },
    {
      "engine": "rdf4j.5.3.2",
      "dataset": "dbpedia",
      "file": "specific_mappingbased_properties_en.nt",
      "triples": 182530,
      "loadingTimeMs": 482,
      "throughputTriplesPerSec": 378692.9460580913,
      "memoryBeforeMb": 9.152793884277344,
      "memoryAfterMb": 119.05145263671875,
      "memoryDeltaMb": 109.8986587524414,
      "cpuPercent": 18.500486854917238,
      "repetitionsMs": [
        472,
        482,
        482
      ]
    },
    {
      "engine": "corese.next",
      "dataset": "bowlogna",
      "file": "Department0.nt",
      "triples": 1233512,
      "loadingTimeMs": 5867,
      "throughputTriplesPerSec": 210245.7814896881,
      "memoryBeforeMb": 8.463150024414062,
      "memoryAfterMb": 186.08457946777344,
      "memoryDeltaMb": 177.11661529541016,
      "cpuPercent": 7.987486965589155,
      "repetitionsMs": [
        6194,
        5867,
        5786
      ]
    },
    {
      "engine": "corese.next",
      "dataset": "bowlogna",
      "file": "Department1.nt",
      "triples": 1241828,
      "loadingTimeMs": 6433,
      "throughputTriplesPerSec": 193040.26115342765,
      "memoryBeforeMb": 8.663803100585938,
      "memoryAfterMb": 187.61609649658203,
      "memoryDeltaMb": 178.95242309570312,
      "cpuPercent": 7.766434500524759,
      "repetitionsMs": [
        6625,
        6431,
        6433
      ]
    },
    {
      "engine": "corese.next",
      "dataset": "bowlogna",
      "file": "Department2.nt",
      "triples": 1253055,
      "loadingTimeMs": 6884,
      "throughputTriplesPerSec": 182024.259151656,
      "memoryBeforeMb": 8.663978576660156,
      "memoryAfterMb": 188.85747528076172,
      "memoryDeltaMb": 180.19349670410156,
      "cpuPercent": 7.847372210223182,
      "repetitionsMs": [
        7157,
        6884,
        6814
      ]
    },
    {
      "engine": "corese.next",
      "dataset": "bowlogna",
      "file": "Department3.nt",
      "triples": 1254024,
      "loadingTimeMs": 6367,
      "throughputTriplesPerSec": 196956.8085440553,
      "memoryBeforeMb": 8.664154052734375,
      "memoryAfterMb": 189.63170623779297,
      "memoryDeltaMb": 180.9675521850586,
      "cpuPercent": 7.867554783280239,
      "repetitionsMs": [
        6491,
        6367,
        6349
      ]
    },
    {
      "engine": "corese.next",
      "dataset": "bowlogna",
      "file": "Department4.nt",
      "triples": 1233164,
      "loadingTimeMs": 6172,
      "throughputTriplesPerSec": 199799.74076474403,
      "memoryBeforeMb": 8.664329528808594,
      "memoryAfterMb": 187.08141326904297,
      "memoryDeltaMb": 178.4172134399414,
      "cpuPercent": 7.826869252299081,
      "repetitionsMs": [
        6233,
        6172,
        6140
      ]
    },
    {
      "engine": "corese.next",
      "dataset": "bowlogna",
      "file": "Department5.nt",
      "triples": 1252595,
      "loadingTimeMs": 6236,
      "throughputTriplesPerSec": 200865.137908916,
      "memoryBeforeMb": 8.664505004882812,
      "memoryAfterMb": 188.88262176513672,
      "memoryDeltaMb": 180.2181167602539,
      "cpuPercent": 7.970727848101267,
      "repetitionsMs": [
        6394,
        6236,
        6199
      ]
    },
    {
      "engine": "corese.next",
      "dataset": "bowlogna",
      "file": "Department6.nt",
      "triples": 1257900,
      "loadingTimeMs": 6335,
      "throughputTriplesPerSec": 198563.5359116022,
      "memoryBeforeMb": 8.664680480957031,
      "memoryAfterMb": 189.67886352539062,
      "memoryDeltaMb": 181.0141830444336,
      "cpuPercent": 8.035973310124746,
      "repetitionsMs": [
        6434,
        6232,
        6335
      ]
    },
    {
      "engine": "corese.next",
      "dataset": "bowlogna",
      "file": "Department7.nt",
      "triples": 1246553,
      "loadingTimeMs": 6264,
      "throughputTriplesPerSec": 199002.71392081736,
      "memoryBeforeMb": 8.66485595703125,
      "memoryAfterMb": 188.74769592285156,
      "memoryDeltaMb": 180.0828399658203,
      "cpuPercent": 7.979709296653985,
      "repetitionsMs": [
        6264,
        6251,
        6283
      ]
    },
    {
      "engine": "corese.next",
      "dataset": "bowlogna",
      "file": "Department8.nt",
      "triples": 1249997,
      "loadingTimeMs": 6185,
      "throughputTriplesPerSec": 202101.3742926435,
      "memoryBeforeMb": 8.66510009765625,
      "memoryAfterMb": 188.86383819580078,
      "memoryDeltaMb": 180.19873809814453,
      "cpuPercent": 8.101943673145577,
      "repetitionsMs": [
        6300,
        6185,
        6169
      ]
    },
    {
      "engine": "corese.next",
      "dataset": "bowlogna",
      "file": "Department9.nt",
      "triples": 1264762,
      "loadingTimeMs": 6264,
      "throughputTriplesPerSec": 201909.6424010217,
      "memoryBeforeMb": 8.665275573730469,
      "memoryAfterMb": 190.3028335571289,
      "memoryDeltaMb": 181.63755798339844,
      "cpuPercent": 8.211429685976205,
      "repetitionsMs": [
        6467,
        6250,
        6264
      ]
    },
    {
      "engine": "corese.4.6.5",
      "dataset": "bowlogna",
      "file": "Department0.nt",
      "triples": 1233512,
      "loadingTimeMs": 43762,
      "throughputTriplesPerSec": 28186.828755541337,
      "memoryBeforeMb": 7.071266174316406,
      "memoryAfterMb": 98.91094970703125,
      "memoryDeltaMb": 91.83968353271484,
      "cpuPercent": 6.588423199235629,
      "repetitionsMs": [
        44767,
        43424,
        43762
      ]
    },
    {
      "engine": "corese.4.6.5",
      "dataset": "bowlogna",
      "file": "Department1.nt",
      "triples": 1241828,
      "loadingTimeMs": 43269,
      "throughputTriplesPerSec": 28700.177956504656,
      "memoryBeforeMb": 7.272727966308594,
      "memoryAfterMb": 99.64826202392578,
      "memoryDeltaMb": 92.37553405761719,
      "cpuPercent": 6.54007275934296,
      "repetitionsMs": [
        43208,
        43269,
        45294
      ]
    },
    {
      "engine": "corese.4.6.5",
      "dataset": "bowlogna",
      "file": "Department2.nt",
      "triples": 1253055,
      "loadingTimeMs": 43526,
      "throughputTriplesPerSec": 28788.655056747688,
      "memoryBeforeMb": 7.2729034423828125,
      "memoryAfterMb": 100.68144989013672,
      "memoryDeltaMb": 93.4085464477539,
      "cpuPercent": 6.562110746234855,
      "repetitionsMs": [
        43526,
        43505,
        44099
      ]
    },
    {
      "engine": "corese.4.6.5",
      "dataset": "bowlogna",
      "file": "Department3.nt",
      "triples": 1254024,
      "loadingTimeMs": 44610,
      "throughputTriplesPerSec": 28110.827168796233,
      "memoryBeforeMb": 7.273284912109375,
      "memoryAfterMb": 100.95321655273438,
      "memoryDeltaMb": 93.679931640625,
      "cpuPercent": 6.546802854344482,
      "repetitionsMs": [
        44214,
        46018,
        44610
      ]
    },
    {
      "engine": "corese.4.6.5",
      "dataset": "bowlogna",
      "file": "Department4.nt",
      "triples": 1233164,
      "loadingTimeMs": 44650,
      "throughputTriplesPerSec": 27618.45464725644,
      "memoryBeforeMb": 7.273460388183594,
      "memoryAfterMb": 99.20059967041016,
      "memoryDeltaMb": 91.92713928222656,
      "cpuPercent": 6.603332151719248,
      "repetitionsMs": [
        45080,
        44650,
        44019
      ]
    },
    {
      "engine": "corese.4.6.5",
      "dataset": "bowlogna",
      "file": "Department5.nt",
      "triples": 1252595,
      "loadingTimeMs": 44835,
      "throughputTriplesPerSec": 27937.883350061336,
      "memoryBeforeMb": 7.2736358642578125,
      "memoryAfterMb": 100.77609252929688,
      "memoryDeltaMb": 93.50245666503906,
      "cpuPercent": 6.5595085012144585,
      "repetitionsMs": [
        44835,
        43683,
        45017
      ]
    },
    {
      "engine": "corese.4.6.5",
      "dataset": "bowlogna",
      "file": "Department6.nt",
      "triples": 1257900,
      "loadingTimeMs": 45661,
      "throughputTriplesPerSec": 27548.673923041544,
      "memoryBeforeMb": 7.273811340332031,
      "memoryAfterMb": 100.9455337524414,
      "memoryDeltaMb": 93.67172241210938,
      "cpuPercent": 6.542541557305337,
      "repetitionsMs": [
        45867,
        45661,
        45438
      ]
    },
    {
      "engine": "corese.4.6.5",
      "dataset": "bowlogna",
      "file": "Department7.nt",
      "triples": 1246553,
      "loadingTimeMs": 45140,
      "throughputTriplesPerSec": 27615.263624280018,
      "memoryBeforeMb": 7.2741241455078125,
      "memoryAfterMb": 100.16598510742188,
      "memoryDeltaMb": 92.89186096191406,
      "cpuPercent": 6.582148979704695,
      "repetitionsMs": [
        45675,
        44803,
        45140
      ]
    },
    {
      "engine": "corese.4.6.5",
      "dataset": "bowlogna",
      "file": "Department8.nt",
      "triples": 1249997,
      "loadingTimeMs": 43704,
      "throughputTriplesPerSec": 28601.432363170417,
      "memoryBeforeMb": 7.274299621582031,
      "memoryAfterMb": 100.18356323242188,
      "memoryDeltaMb": 92.90926361083984,
      "cpuPercent": 6.504281903692265,
      "repetitionsMs": [
        43704,
        43512,
        44378
      ]
    },
    {
      "engine": "corese.4.6.5",
      "dataset": "bowlogna",
      "file": "Department9.nt",
      "triples": 1264762,
      "loadingTimeMs": 44268,
      "throughputTriplesPerSec": 28570.57016354929,
      "memoryBeforeMb": 7.27447509765625,
      "memoryAfterMb": 101.23797607421875,
      "memoryDeltaMb": 93.9635009765625,
      "cpuPercent": 6.564608735809651,
      "repetitionsMs": [
        44268,
        44056,
        45450
      ]
    },
    {
      "engine": "jena.6.2.0",
      "dataset": "bowlogna",
      "file": "Department0.nt",
      "triples": 1233512,
      "loadingTimeMs": 4853,
      "throughputTriplesPerSec": 254175.1493921286,
      "memoryBeforeMb": 14.483482360839844,
      "memoryAfterMb": 154.23440551757812,
      "memoryDeltaMb": 139.75079345703125,
      "cpuPercent": 9.33923957179771,
      "repetitionsMs": [
        5246,
        4853,
        4829
      ]
    },
    {
      "engine": "jena.6.2.0",
      "dataset": "bowlogna",
      "file": "Department1.nt",
      "triples": 1241828,
      "loadingTimeMs": 4700,
      "throughputTriplesPerSec": 264218.7234042553,
      "memoryBeforeMb": 14.484130859375,
      "memoryAfterMb": 154.33795928955078,
      "memoryDeltaMb": 139.85382843017578,
      "cpuPercent": 9.395125647177673,
      "repetitionsMs": [
        4952,
        4700,
        4696
      ]
    },
    {
      "engine": "jena.6.2.0",
      "dataset": "bowlogna",
      "file": "Department2.nt",
      "triples": 1253055,
      "loadingTimeMs": 4624,
      "throughputTriplesPerSec": 270989.4031141869,
      "memoryBeforeMb": 14.484306335449219,
      "memoryAfterMb": 155.740478515625,
      "memoryDeltaMb": 141.25617218017578,
      "cpuPercent": 9.43663787546732,
      "repetitionsMs": [
        4624,
        4636,
        4600
      ]
    },
    {
      "engine": "jena.6.2.0",
      "dataset": "bowlogna",
      "file": "Department3.nt",
      "triples": 1254024,
      "loadingTimeMs": 4554,
      "throughputTriplesPerSec": 275367.58893280633,
      "memoryBeforeMb": 14.485214233398438,
      "memoryAfterMb": 155.95099639892578,
      "memoryDeltaMb": 141.46578216552734,
      "cpuPercent": 9.273772204806688,
      "repetitionsMs": [
        4698,
        4536,
        4554
      ]
    },
    {
      "engine": "jena.6.2.0",
      "dataset": "bowlogna",
      "file": "Department4.nt",
      "triples": 1233164,
      "loadingTimeMs": 4452,
      "throughputTriplesPerSec": 276991.0152740342,
      "memoryBeforeMb": 14.485389709472656,
      "memoryAfterMb": 154.40402221679688,
      "memoryDeltaMb": 139.91854095458984,
      "cpuPercent": 9.30517711171662,
      "repetitionsMs": [
        4452,
        4354,
        4514
      ]
    },
    {
      "engine": "jena.6.2.0",
      "dataset": "bowlogna",
      "file": "Department5.nt",
      "triples": 1252595,
      "loadingTimeMs": 4507,
      "throughputTriplesPerSec": 277922.1211448858,
      "memoryBeforeMb": 14.485748291015625,
      "memoryAfterMb": 156.43462371826172,
      "memoryDeltaMb": 141.9488754272461,
      "cpuPercent": 9.068595788657795,
      "repetitionsMs": [
        4507,
        4451,
        4618
      ]
    },
    {
      "engine": "jena.6.2.0",
      "dataset": "bowlogna",
      "file": "Department6.nt",
      "triples": 1257900,
      "loadingTimeMs": 4483,
      "throughputTriplesPerSec": 280593.35266562575,
      "memoryBeforeMb": 14.485923767089844,
      "memoryAfterMb": 156.48433685302734,
      "memoryDeltaMb": 141.9984130859375,
      "cpuPercent": 9.364637219790424,
      "repetitionsMs": [
        4483,
        4470,
        4484
      ]
    },
    {
      "engine": "jena.6.2.0",
      "dataset": "bowlogna",
      "file": "Department7.nt",
      "triples": 1246553,
      "loadingTimeMs": 4468,
      "throughputTriplesPerSec": 278995.74753804837,
      "memoryBeforeMb": 14.486434936523438,
      "memoryAfterMb": 155.75614166259766,
      "memoryDeltaMb": 141.26970672607422,
      "cpuPercent": 9.268808673806692,
      "repetitionsMs": [
        4468,
        4482,
        4457
      ]
    },
    {
      "engine": "jena.6.2.0",
      "dataset": "bowlogna",
      "file": "Department8.nt",
      "triples": 1249997,
      "loadingTimeMs": 4493,
      "throughputTriplesPerSec": 278209.8820387269,
      "memoryBeforeMb": 14.486610412597656,
      "memoryAfterMb": 159.1686553955078,
      "memoryDeltaMb": 144.68204498291016,
      "cpuPercent": 9.053278141273868,
      "repetitionsMs": [
        4510,
        4469,
        4493
      ]
    },
    {
      "engine": "jena.6.2.0",
      "dataset": "bowlogna",
      "file": "Department9.nt",
      "triples": 1264762,
      "loadingTimeMs": 4549,
      "throughputTriplesPerSec": 278030.77599472407,
      "memoryBeforeMb": 14.486785888671875,
      "memoryAfterMb": 158.1819610595703,
      "memoryDeltaMb": 143.69517517089844,
      "cpuPercent": 9.176470588235293,
      "repetitionsMs": [
        4549,
        4557,
        4537
      ]
    },
    {
      "engine": "rdf4j.5.3.2",
      "dataset": "bowlogna",
      "file": "Department0.nt",
      "triples": 1233512,
      "loadingTimeMs": 3529,
      "throughputTriplesPerSec": 349535.84584868234,
      "memoryBeforeMb": 12.705604553222656,
      "memoryAfterMb": 225.2916259765625,
      "memoryDeltaMb": 212.58602142333984,
      "cpuPercent": 10.704178458465124,
      "repetitionsMs": [
        3386,
        3767,
        3529
      ]
    },
    {
      "engine": "rdf4j.5.3.2",
      "dataset": "bowlogna",
      "file": "Department1.nt",
      "triples": 1241828,
      "loadingTimeMs": 3444,
      "throughputTriplesPerSec": 360577.23577235773,
      "memoryBeforeMb": 12.706489562988281,
      "memoryAfterMb": 226.69873809814453,
      "memoryDeltaMb": 213.99224853515625,
      "cpuPercent": 9.958144401813742,
      "repetitionsMs": [
        3531,
        3422,
        3444
      ]
    },
    {
      "engine": "rdf4j.5.3.2",
      "dataset": "bowlogna",
      "file": "Department2.nt",
      "triples": 1253055,
      "loadingTimeMs": 3466,
      "throughputTriplesPerSec": 361527.6976341604,
      "memoryBeforeMb": 12.7066650390625,
      "memoryAfterMb": 228.20441436767578,
      "memoryDeltaMb": 215.49774932861328,
      "cpuPercent": 9.864702860078781,
      "repetitionsMs": [
        3401,
        3466,
        3478
      ]
    },
    {
      "engine": "rdf4j.5.3.2",
      "dataset": "bowlogna",
      "file": "Department3.nt",
      "triples": 1254024,
      "loadingTimeMs": 3405,
      "throughputTriplesPerSec": 368288.986784141,
      "memoryBeforeMb": 12.706916809082031,
      "memoryAfterMb": 227.8868637084961,
      "memoryDeltaMb": 215.17994689941406,
      "cpuPercent": 10.06008583690987,
      "repetitionsMs": [
        3389,
        3468,
        3405
      ]
    },
    {
      "engine": "rdf4j.5.3.2",
      "dataset": "bowlogna",
      "file": "Department4.nt",
      "triples": 1233164,
      "loadingTimeMs": 3386,
      "throughputTriplesPerSec": 364194.92025989364,
      "memoryBeforeMb": 12.70709228515625,
      "memoryAfterMb": 225.0575714111328,
      "memoryDeltaMb": 212.35047912597656,
      "cpuPercent": 9.481090589270009,
      "repetitionsMs": [
        3386,
        3394,
        3385
      ]
    },
    {
      "engine": "rdf4j.5.3.2",
      "dataset": "bowlogna",
      "file": "Department5.nt",
      "triples": 1252595,
      "loadingTimeMs": 3367,
      "throughputTriplesPerSec": 372021.087021087,
      "memoryBeforeMb": 12.711578369140625,
      "memoryAfterMb": 227.64551544189453,
      "memoryDeltaMb": 214.9339370727539,
      "cpuPercent": 9.871967654986523,
      "repetitionsMs": [
        3367,
        3336,
        3540
      ]
    },
    {
      "engine": "rdf4j.5.3.2",
      "dataset": "bowlogna",
      "file": "Department6.nt",
      "triples": 1257900,
      "loadingTimeMs": 3522,
      "throughputTriplesPerSec": 357155.02555366274,
      "memoryBeforeMb": 12.712142944335938,
      "memoryAfterMb": 228.6913070678711,
      "memoryDeltaMb": 215.9785919189453,
      "cpuPercent": 10.189573459715639,
      "repetitionsMs": [
        3327,
        3657,
        3522
      ]
    },
    {
      "engine": "rdf4j.5.3.2",
      "dataset": "bowlogna",
      "file": "Department7.nt",
      "triples": 1246553,
      "loadingTimeMs": 3416,
      "throughputTriplesPerSec": 364915.98360655736,
      "memoryBeforeMb": 12.713119506835938,
      "memoryAfterMb": 226.96243286132812,
      "memoryDeltaMb": 214.2493133544922,
      "cpuPercent": 9.942438513867085,
      "repetitionsMs": [
        4011,
        3416,
        3375
      ]
    },
    {
      "engine": "rdf4j.5.3.2",
      "dataset": "bowlogna",
      "file": "Department8.nt",
      "triples": 1249997,
      "loadingTimeMs": 3400,
      "throughputTriplesPerSec": 367646.17647058825,
      "memoryBeforeMb": 12.713294982910156,
      "memoryAfterMb": 227.521240234375,
      "memoryDeltaMb": 214.80794525146484,
      "cpuPercent": 9.924995639281352,
      "repetitionsMs": [
        3386,
        3400,
        3413
      ]
    },
    {
      "engine": "rdf4j.5.3.2",
      "dataset": "bowlogna",
      "file": "Department9.nt",
      "triples": 1264762,
      "loadingTimeMs": 3460,
      "throughputTriplesPerSec": 365538.15028901736,
      "memoryBeforeMb": 12.713470458984375,
      "memoryAfterMb": 229.3471221923828,
      "memoryDeltaMb": 216.63365173339844,
      "cpuPercent": 9.813407049067035,
      "repetitionsMs": [
        3481,
        3452,
        3460
      ]
    }
  ],
  "queryRuns": [
    {
      "engine": "corese.next",
      "dataset": "bowlogna",
      "queryId": "query_1",
      "medianMs": 8,
      "repetitionsMs": [
        8,
        8,
        7
      ]
    },
    {
      "engine": "corese.next",
      "dataset": "bowlogna",
      "queryId": "query_2",
      "medianMs": 429,
      "repetitionsMs": [
        433,
        429,
        398
      ]
    },
    {
      "engine": "corese.next",
      "dataset": "bowlogna",
      "queryId": "query_3",
      "medianMs": 670,
      "repetitionsMs": [
        670,
        789,
        634
      ]
    },
    {
      "engine": "corese.next",
      "dataset": "bowlogna",
      "queryId": "query_4",
      "medianMs": 470,
      "repetitionsMs": [
        470,
        461,
        489
      ]
    },
    {
      "engine": "corese.next",
      "dataset": "bowlogna",
      "queryId": "query_5",
      "medianMs": 1151,
      "repetitionsMs": [
        1222,
        1151,
        1081
      ]
    },
    {
      "engine": "corese.next",
      "dataset": "bowlogna",
      "queryId": "query_6",
      "medianMs": 540,
      "repetitionsMs": [
        534,
        540,
        711
      ]
    },
    {
      "engine": "corese.next",
      "dataset": "bowlogna",
      "queryId": "query_7",
      "medianMs": 1241,
      "repetitionsMs": [
        1241,
        1388,
        920
      ]
    },
    {
      "engine": "corese.next",
      "dataset": "bowlogna",
      "queryId": "query_8",
      "medianMs": 10443,
      "repetitionsMs": [
        10837,
        10443,
        10307
      ]
    },
    {
      "engine": "corese.next",
      "dataset": "bowlogna",
      "queryId": "query_9",
      "medianMs": 5367,
      "repetitionsMs": [
        5452,
        5367,
        4812
      ]
    },
    {
      "engine": "corese.next",
      "dataset": "bowlogna",
      "queryId": "query_10",
      "medianMs": -1,
      "repetitionsMs": [
        -1,
        -1,
        -1
      ]
    },
    {
      "engine": "corese.next",
      "dataset": "bowlogna",
      "queryId": "query_11",
      "medianMs": 1284,
      "repetitionsMs": [
        1444,
        1284,
        1016
      ]
    },
    {
      "engine": "corese.next",
      "dataset": "bowlogna",
      "queryId": "query_12",
      "medianMs": 488,
      "repetitionsMs": [
        486,
        488,
        634
      ]
    },
    {
      "engine": "corese.next",
      "dataset": "bowlogna",
      "queryId": "query_13",
      "medianMs": 1435,
      "repetitionsMs": [
        1331,
        1843,
        1435
      ]
    },
    {
      "engine": "corese.next",
      "dataset": "bowlogna",
      "queryId": "query_14",
      "medianMs": 1420,
      "repetitionsMs": [
        1420,
        1330,
        1684
      ]
    },
    {
      "engine": "corese.next",
      "dataset": "bowlogna",
      "queryId": "query_15",
      "medianMs": 332,
      "repetitionsMs": [
        332,
        322,
        381
      ]
    },
    {
      "engine": "corese.next",
      "dataset": "bowlogna",
      "queryId": "query_16",
      "medianMs": 1567,
      "repetitionsMs": [
        1567,
        1523,
        1680
      ]
    },
    {
      "engine": "corese.next",
      "dataset": "bowlogna",
      "queryId": "query_17",
      "medianMs": 503,
      "repetitionsMs": [
        582,
        503,
        498
      ]
    },
    {
      "engine": "corese.4.6.5",
      "dataset": "bowlogna",
      "queryId": "query_1",
      "medianMs": 22,
      "repetitionsMs": [
        22,
        25,
        21
      ]
    },
    {
      "engine": "corese.4.6.5",
      "dataset": "bowlogna",
      "queryId": "query_2",
      "medianMs": 66,
      "repetitionsMs": [
        64,
        73,
        66
      ]
    },
    {
      "engine": "corese.4.6.5",
      "dataset": "bowlogna",
      "queryId": "query_3",
      "medianMs": 263,
      "repetitionsMs": [
        265,
        262,
        263
      ]
    },
    {
      "engine": "corese.4.6.5",
      "dataset": "bowlogna",
      "queryId": "query_4",
      "medianMs": 128,
      "repetitionsMs": [
        185,
        123,
        128
      ]
    },
    {
      "engine": "corese.4.6.5",
      "dataset": "bowlogna",
      "queryId": "query_5",
      "medianMs": 150,
      "repetitionsMs": [
        153,
        149,
        150
      ]
    },
    {
      "engine": "corese.4.6.5",
      "dataset": "bowlogna",
      "queryId": "query_6",
      "medianMs": 285,
      "repetitionsMs": [
        285,
        286,
        280
      ]
    },
    {
      "engine": "corese.4.6.5",
      "dataset": "bowlogna",
      "queryId": "query_7",
      "medianMs": 149,
      "repetitionsMs": [
        170,
        148,
        149
      ]
    },
    {
      "engine": "corese.4.6.5",
      "dataset": "bowlogna",
      "queryId": "query_8",
      "medianMs": 7684,
      "repetitionsMs": [
        7800,
        7668,
        7684
      ]
    },
    {
      "engine": "corese.4.6.5",
      "dataset": "bowlogna",
      "queryId": "query_9",
      "medianMs": 11503,
      "repetitionsMs": [
        11503,
        11465,
        11810
      ]
    },
    {
      "engine": "corese.4.6.5",
      "dataset": "bowlogna",
      "queryId": "query_10",
      "medianMs": 264,
      "repetitionsMs": [
        264,
        254,
        266
      ]
    },
    {
      "engine": "corese.4.6.5",
      "dataset": "bowlogna",
      "queryId": "query_11",
      "medianMs": 403,
      "repetitionsMs": [
        390,
        511,
        403
      ]
    },
    {
      "engine": "corese.4.6.5",
      "dataset": "bowlogna",
      "queryId": "query_12",
      "medianMs": 407,
      "repetitionsMs": [
        407,
        403,
        416
      ]
    },
    {
      "engine": "corese.4.6.5",
      "dataset": "bowlogna",
      "queryId": "query_13",
      "medianMs": 7350,
      "repetitionsMs": [
        7484,
        7261,
        7350
      ]
    },
    {
      "engine": "corese.4.6.5",
      "dataset": "bowlogna",
      "queryId": "query_14",
      "medianMs": 11415,
      "repetitionsMs": [
        11300,
        11449,
        11415
      ]
    },
    {
      "engine": "corese.4.6.5",
      "dataset": "bowlogna",
      "queryId": "query_15",
      "medianMs": 13,
      "repetitionsMs": [
        13,
        13,
        8
      ]
    },
    {
      "engine": "corese.4.6.5",
      "dataset": "bowlogna",
      "queryId": "query_16",
      "medianMs": 1441,
      "repetitionsMs": [
        1433,
        1442,
        1441
      ]
    },
    {
      "engine": "corese.4.6.5",
      "dataset": "bowlogna",
      "queryId": "query_17",
      "medianMs": 265,
      "repetitionsMs": [
        265,
        285,
        263
      ]
    },
    {
      "engine": "jena.6.2.0",
      "dataset": "bowlogna",
      "queryId": "query_1",
      "medianMs": 9,
      "repetitionsMs": [
        9,
        8,
        9
      ]
    },
    {
      "engine": "jena.6.2.0",
      "dataset": "bowlogna",
      "queryId": "query_2",
      "medianMs": 23,
      "repetitionsMs": [
        23,
        21,
        24
      ]
    },
    {
      "engine": "jena.6.2.0",
      "dataset": "bowlogna",
      "queryId": "query_3",
      "medianMs": 324,
      "repetitionsMs": [
        320,
        324,
        324
      ]
    },
    {
      "engine": "jena.6.2.0",
      "dataset": "bowlogna",
      "queryId": "query_4",
      "medianMs": 142,
      "repetitionsMs": [
        142,
        142,
        145
      ]
    },
    {
      "engine": "jena.6.2.0",
      "dataset": "bowlogna",
      "queryId": "query_5",
      "medianMs": 1,
      "repetitionsMs": [
        2,
        1,
        1
      ]
    },
    {
      "engine": "jena.6.2.0",
      "dataset": "bowlogna",
      "queryId": "query_6",
      "medianMs": 143,
      "repetitionsMs": [
        162,
        143,
        141
      ]
    },
    {
      "engine": "jena.6.2.0",
      "dataset": "bowlogna",
      "queryId": "query_7",
      "medianMs": 1,
      "repetitionsMs": [
        1,
        2,
        1
      ]
    },
    {
      "engine": "jena.6.2.0",
      "dataset": "bowlogna",
      "queryId": "query_8",
      "medianMs": 3543,
      "repetitionsMs": [
        3691,
        3511,
        3543
      ]
    },
    {
      "engine": "jena.6.2.0",
      "dataset": "bowlogna",
      "queryId": "query_9",
      "medianMs": 3339,
      "repetitionsMs": [
        3210,
        3478,
        3339
      ]
    },
    {
      "engine": "jena.6.2.0",
      "dataset": "bowlogna",
      "queryId": "query_10",
      "medianMs": -1,
      "repetitionsMs": [
        -1,
        -1,
        -1
      ]
    },
    {
      "engine": "jena.6.2.0",
      "dataset": "bowlogna",
      "queryId": "query_11",
      "medianMs": -1,
      "repetitionsMs": [
        -1,
        -1,
        -1
      ]
    },
    {
      "engine": "jena.6.2.0",
      "dataset": "bowlogna",
      "queryId": "query_12",
      "medianMs": 383,
      "repetitionsMs": [
        367,
        383,
        403
      ]
    },
    {
      "engine": "jena.6.2.0",
      "dataset": "bowlogna",
      "queryId": "query_13",
      "medianMs": 131,
      "repetitionsMs": [
        137,
        131,
        128
      ]
    },
    {
      "engine": "jena.6.2.0",
      "dataset": "bowlogna",
      "queryId": "query_14",
      "medianMs": 572,
      "repetitionsMs": [
        591,
        572,
        569
      ]
    },
    {
      "engine": "jena.6.2.0",
      "dataset": "bowlogna",
      "queryId": "query_15",
      "medianMs": 4,
      "repetitionsMs": [
        5,
        4,
        4
      ]
    },
    {
      "engine": "jena.6.2.0",
      "dataset": "bowlogna",
      "queryId": "query_16",
      "medianMs": 548,
      "repetitionsMs": [
        548,
        541,
        555
      ]
    },
    {
      "engine": "jena.6.2.0",
      "dataset": "bowlogna",
      "queryId": "query_17",
      "medianMs": 153,
      "repetitionsMs": [
        151,
        161,
        153
      ]
    },
    {
      "engine": "rdf4j.5.3.2",
      "dataset": "bowlogna",
      "queryId": "query_1",
      "medianMs": 6,
      "repetitionsMs": [
        6,
        6,
        6
      ]
    },
    {
      "engine": "rdf4j.5.3.2",
      "dataset": "bowlogna",
      "queryId": "query_2",
      "medianMs": 14,
      "repetitionsMs": [
        14,
        15,
        13
      ]
    },
    {
      "engine": "rdf4j.5.3.2",
      "dataset": "bowlogna",
      "queryId": "query_3",
      "medianMs": 83,
      "repetitionsMs": [
        90,
        82,
        83
      ]
    },
    {
      "engine": "rdf4j.5.3.2",
      "dataset": "bowlogna",
      "queryId": "query_4",
      "medianMs": 24,
      "repetitionsMs": [
        24,
        23,
        39
      ]
    },
    {
      "engine": "rdf4j.5.3.2",
      "dataset": "bowlogna",
      "queryId": "query_5",
      "medianMs": 2,
      "repetitionsMs": [
        2,
        2,
        2
      ]
    },
    {
      "engine": "rdf4j.5.3.2",
      "dataset": "bowlogna",
      "queryId": "query_6",
      "medianMs": 68,
      "repetitionsMs": [
        75,
        66,
        68
      ]
    },
    {
      "engine": "rdf4j.5.3.2",
      "dataset": "bowlogna",
      "queryId": "query_7",
      "medianMs": 1,
      "repetitionsMs": [
        2,
        1,
        1
      ]
    },
    {
      "engine": "rdf4j.5.3.2",
      "dataset": "bowlogna",
      "queryId": "query_8",
      "medianMs": 1595,
      "repetitionsMs": [
        1587,
        1623,
        1595
      ]
    },
    {
      "engine": "rdf4j.5.3.2",
      "dataset": "bowlogna",
      "queryId": "query_9",
      "medianMs": 1093,
      "repetitionsMs": [
        1093,
        1085,
        1133
      ]
    },
    {
      "engine": "rdf4j.5.3.2",
      "dataset": "bowlogna",
      "queryId": "query_10",
      "medianMs": -1,
      "repetitionsMs": [
        -1,
        -1,
        -1
      ]
    },
    {
      "engine": "rdf4j.5.3.2",
      "dataset": "bowlogna",
      "queryId": "query_11",
      "medianMs": 25,
      "repetitionsMs": [
        27,
        24,
        25
      ]
    },
    {
      "engine": "rdf4j.5.3.2",
      "dataset": "bowlogna",
      "queryId": "query_12",
      "medianMs": 147,
      "repetitionsMs": [
        146,
        161,
        147
      ]
    },
    {
      "engine": "rdf4j.5.3.2",
      "dataset": "bowlogna",
      "queryId": "query_13",
      "medianMs": 56,
      "repetitionsMs": [
        56,
        56,
        56
      ]
    },
    {
      "engine": "rdf4j.5.3.2",
      "dataset": "bowlogna",
      "queryId": "query_14",
      "medianMs": 240,
      "repetitionsMs": [
        241,
        238,
        240
      ]
    },
    {
      "engine": "rdf4j.5.3.2",
      "dataset": "bowlogna",
      "queryId": "query_15",
      "medianMs": 1,
      "repetitionsMs": [
        1,
        1,
        1
      ]
    },
    {
      "engine": "rdf4j.5.3.2",
      "dataset": "bowlogna",
      "queryId": "query_16",
      "medianMs": 210,
      "repetitionsMs": [
        210,
        249,
        206
      ]
    },
    {
      "engine": "rdf4j.5.3.2",
      "dataset": "bowlogna",
      "queryId": "query_17",
      "medianMs": 29,
      "repetitionsMs": [
        28,
        29,
        45
      ]
    }
  ]
};