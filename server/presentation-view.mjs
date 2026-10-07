/** Preserve frozen rendering while withholding grading and analysis in unanswered MCP DTOs. */
export function presentationView(presentation,{revealed=false}={}) {
 if(!presentation)return undefined;
 const view=structuredClone(presentation);if(revealed)return view;
 delete view.payload.answer;
 const content=view.payload.legacy;
 for(const key of ['answer','answerIndex','correctReason','explanation','explanation_zh','memoryPoint','translationZh','choiceAnalysis','choiceExplanations','choiceDetails','explanationNodes','readingAnalysis','passageTranslation','translationLines','transcript','transcriptTranslation'])delete content[key];
 if(content.assembly)delete content.assembly.correctOrder;
 for(const material of view.materials??[])if(material.payload)for(const key of ['transcript','transcriptTranslation','translation','translationLines','readingAnalysis','explanation'])delete material.payload[key];
 return view;
}
