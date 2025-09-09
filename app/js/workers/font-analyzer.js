/**
 * Project: Three.js JSON Font Editor
 * File: editor/js/workers/font-analyzer.js
 * Created: 2025-08-29
 * Author: @lewopxd
 *
 * Description:
 * This script runs in a dedicated Web Worker thread. It receives font
 * data, performs a lightweight performance analysis, and posts the
 * result back to the main application.
 */

const dev = false; //  

if(dev){
console.log('[WORKER] Font Analyzer Worker initialized. dev:', dev);
}

const fontAnalyzerThresholds = {
    overallScore: {
        fullyOptimized: 90,
        wellOptimized: 70,
        acceptable: 40,
    },
    glyphCount: {
        optimalMin: 95,
        optimalMax: 250,
        scoreAdjustment: 20
    },
    fileSize: { 
        optimalMax: 1024000, // 1000 KB en bytes
        scoreAdjustment: 250
    },
    avgCommandsPerGlyph: {
        optimalMax: 40,
        scoreAdjustment: 1.5,
    },
    curveRatio: {
        veryLow: 10,
        low: 40,
        high: 80,
    }
};

const fontEvaluationMatrix = {
    'very_small_size': {
        'very_low_curveRatio': {
            level: 'Fully Optimized',
            evaluation: "Optimal.",
            conclusion: "Simple design, efficient geometry. Excellent loading and performance. Ideal for UIs and technical typography."
        },
        'low_curveRatio': {
            level: 'Fully Optimized',
            evaluation: "Optimal.",
            conclusion: "Small file with adequate complexity. Very good balance between design and performance."
        },
        'high_curveRatio': {
            level: 'Fully Optimized',
            evaluation: "Optimal.",
            conclusion: "A very small file with high geometric complexity. This is a great achievement in optimization."
        },
        'very_high_curveRatio': {
            level: 'Fully Optimized',
            evaluation: "Perfect.",
            conclusion: "The file is extremely small, but the paths are very complex. Maximum efficiency and optimization."
        }
    },
    'small_size': {
        'very_low_curveRatio': {
            level: 'Well Optimized',
            evaluation: "Good.",
            conclusion: "Slightly larger size than expected for such simple geometry. Check for redundant points."
        },
        'low_curveRatio': {
            level: 'Well Optimized',
            evaluation: "Good.",
            conclusion: "The relationship between size and complexity is as expected. Performance will be very good in most cases."
        },
        'high_curveRatio': {
            level: 'Well Optimized',
            evaluation: "Good.",
            conclusion: "Small file with high geometric complexity. An excellent balance between visual fidelity and performance has been achieved."
        },
        'very_high_curveRatio': {
            level: 'Well Optimized',
            evaluation: "Excellent.",
            conclusion: "Small size for very high complexity. This indicates an outstanding optimization job."
        }
    },
    'medium_size': {
        'very_low_curveRatio': {
            level: 'Acceptable',
            evaluation: "Warning.",
            conclusion: "Large size for a simple geometry. The font is not well-optimized. Performance is likely to be affected."
        },
        'low_curveRatio': {
            level: 'Acceptable',
            evaluation: "Warning.",
            conclusion: "The font has a size that could be considered large for its complexity level. Check path optimization."
        },
        'high_curveRatio': {
            level: 'Acceptable',
            evaluation: "Good to Moderate.",
            conclusion: "The font has a considerable size, justified by the high complexity of its curves. Performance may vary by device."
        },
        'very_high_curveRatio': {
            level: 'Acceptable',
            evaluation: "Moderate.",
            conclusion: "The file size and high geometric complexity are in balance. Acceptable, but with potential performance impacts."
        }
    },
    'large_size': {
        'very_low_curveRatio': {
            level: 'Critical',
            evaluation: "Critical.",
            conclusion: "The file is excessively large without justifying complexity. A high risk of performance impact."
        },
        'low_curveRatio': {
            level: 'Critical',
            evaluation: "Critical.",
            conclusion: "The font is too large for its complexity. This can cause serious performance issues in the browser."
        },
        'high_curveRatio': {
            level: 'Critical',
            evaluation: "Warning.",
            conclusion: "A very large file, which is expected given its complexity. Its use can cause performance issues on less powerful devices."
        },
        'very_high_curveRatio': {
            level: 'Critical',
            evaluation: "Critical.",
            conclusion: "The file is extremely large with the highest complexity. The font is not suitable for web or performance-sensitive applications."
        }
    }
};

function analisis_font({ fontData, fileSize }) { 
    const glyphs = fontData.glyphs || {};
    const chars = Object.keys(glyphs);
    
    let totalCommands = 0;
    let totalCurves = 0;

    for (const char of chars) {
        const outline = glyphs[char].o;
        if (typeof outline === 'string' && outline.length > 0) {
            const commands = (outline.match(/[mlqc]/g) || []).length;
            const curves = (outline.match(/[qc]/g) || []).length;
            totalCommands += commands;
            totalCurves += curves;
        }
    }

    const glyphCount = chars.length;
    const avgCommandsPerGlyph = (glyphCount > 0) ? totalCommands / glyphCount : 0;
    const avgCurveRatio = (totalCommands > 0) ? (totalCurves / totalCommands) * 100 : 0;
    
    // 1. Calculated scores for each metric (0-100 scale)
     const glyphCountScore = Math.min(100, Math.max(0, 100 - (glyphCount - fontAnalyzerThresholds.glyphCount.optimalMax) / fontAnalyzerThresholds.glyphCount.scoreAdjustment));
    const avgCommandsScore = Math.min(100, Math.max(0, 100 - (avgCommandsPerGlyph - fontAnalyzerThresholds.avgCommandsPerGlyph.optimalMax) * fontAnalyzerThresholds.avgCommandsPerGlyph.scoreAdjustment));
    const fileSizeScore = Math.min(100, Math.max(0, 100 - (fileSize - fontAnalyzerThresholds.fileSize.optimalMax) / fontAnalyzerThresholds.fileSize.scoreAdjustment));           
  
    // 2. Final weighted score calculation
     const finalSizeScore = (glyphCountScore * 0.35) + (fileSizeScore * 0.35) + (avgCommandsScore * 0.30);
    const finalSizeCategory = classifyScore(finalSizeScore, fontAnalyzerThresholds.overallScore);

    //3. Curve ratio classification
     let curveRatioCategory;
    if (avgCurveRatio < fontAnalyzerThresholds.curveRatio.veryLow) {
        curveRatioCategory = 'very_low_curveRatio';
    } else if (avgCurveRatio < fontAnalyzerThresholds.curveRatio.low) {
        curveRatioCategory = 'low_curveRatio';
    } else if (avgCurveRatio < fontAnalyzerThresholds.curveRatio.high) {
        curveRatioCategory = 'high_curveRatio';
    } else {
        curveRatioCategory = 'very_high_curveRatio';
    }
    
    // Manejar el caso de no hay comandos para prevenir un TypeError
    let evaluationResult;
    if (totalCommands === 0) {
        evaluationResult = {
            level: 'No Glyphs',
            evaluation: 'N/A',
            conclusion: 'The font contains no outlines to analyze.'
        };
        if (dev) {
            console.log("DEV: The font contains no commands. Analysis aborted.");
        }
    } else {

        //4. Evaluation matrix lookup
         evaluationResult = fontEvaluationMatrix[finalSizeCategory][curveRatioCategory];
    }

    const result = {
        overall: evaluationResult.level,
        evaluation: evaluationResult.evaluation,
        conclusion: evaluationResult.conclusion,
        detailedMetrics: {
            glyphCount: glyphCount,
            avgCommandsPerGlyph: parseFloat(avgCommandsPerGlyph.toFixed(2)),
            avgCurveRatio: parseFloat(avgCurveRatio.toFixed(2)),
            fileSize: fileSize // shown in bytes
        }
    };
    
    if (dev) {
        console.groupCollapsed("DEV: Font Analysis Results");
        console.log("--- Raw Metrics ---");
        console.log("Glyph Count:", glyphCount);
        console.log("Total Commands:", totalCommands);
        console.log("Total Curves:", totalCurves);
        console.log("File Size (bytes):", fileSize.toFixed(2));
        console.log("--- Scores (0-100) ---");
        console.log("Glyph Count Score:", glyphCountScore.toFixed(2));
        console.log("Avg. Commands Score:", avgCommandsScore.toFixed(2));
        console.log("File Size Score:", fileSizeScore.toFixed(2));
        console.log("Final Size Score (Ponderado):", finalSizeScore.toFixed(2));
        console.log("--- Categories ---");
        console.log("Final Size Category:", finalSizeCategory);
        console.log("Avg. Curve Ratio:", avgCurveRatio.toFixed(2) + "%");
        console.log("Curve Ratio Category:", curveRatioCategory);
        console.log("--- Final Evaluation ---");
        console.log("Overall Level:", result.overall);
        console.log("Evaluation:", result.evaluation);
        console.log("Conclusion:", result.conclusion);
        console.groupEnd();
    }

    return result;
}

function classifyScore(score, thresholds) {
    if (score >= thresholds.fullyOptimized) return 'very_small_size';
    if (score >= thresholds.wellOptimized) return 'small_size';
    if (score >= thresholds.acceptable) return 'medium_size';
    return 'large_size';
}

self.onmessage = function (e) {
    const { fontData, fileSize } = e.data; 
    const result = analisis_font({ fontData, fileSize });
    
    // Send the result back to the main thread in JSON format
    self.postMessage(JSON.stringify(result));
};