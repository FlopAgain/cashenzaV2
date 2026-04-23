use shopify_function::prelude::*;
use shopify_function::scalars::Decimal;
use shopify_function::Result;
use serde::Deserialize;

#[typegen("schema.graphql")]
pub mod schema {
    #[query("src/cart_lines_discounts_generate_run.graphql")]
    pub mod cart_lines_discounts_generate_run {}
}

#[shopify_function]
fn cart_lines_discounts_generate_run(
    input: schema::cart_lines_discounts_generate_run::Input,
) -> Result<schema::CartLinesDiscountsGenerateRunResult> {
    if !input
        .discount()
        .discount_classes()
        .contains(&schema::DiscountClass::Product)
    {
        return Ok(schema::CartLinesDiscountsGenerateRunResult { operations: vec![] });
    }

    let Some(config) = input
        .discount()
        .metafield()
        .as_ref()
        .and_then(|metafield| serde_json::from_str::<BundleConfig>(metafield.value()).ok())
    else {
        return Ok(schema::CartLinesDiscountsGenerateRunResult { operations: vec![] });
    };

    let value = config.value.parse::<f64>().unwrap_or(0.0);
    if value <= 0.0 {
        return Ok(schema::CartLinesDiscountsGenerateRunResult { operations: vec![] });
    }

    let matching_lines = input
        .cart()
        .lines()
        .iter()
        .filter(|line| {
            line.attribute()
                .as_ref()
                .is_some_and(|attribute| attribute.value() == Some(&config.bundle_id))
        })
        .filter(|line| config.bundle_type == "CROSS_SELL" || *line.quantity() > 1)
        .collect::<Vec<_>>();

    if matching_lines.is_empty() {
        return Ok(schema::CartLinesDiscountsGenerateRunResult { operations: vec![] });
    }

    let bundle_subtotal = matching_lines
        .iter()
        .map(|line| line.cost().subtotal_amount().amount().0)
        .sum::<f64>();
    let line_count = matching_lines.len() as f64;

    let candidates = matching_lines
        .iter()
        .filter_map(|line| {
            let discount_value = match config.value_type.as_str() {
                "FIXED_AMOUNT" => schema::ProductDiscountCandidateValue::FixedAmount(
                    schema::ProductDiscountCandidateFixedAmount {
                        amount: Decimal(if config.bundle_type == "CROSS_SELL" { value / line_count } else { value }),
                        applies_to_each_item: Some(false),
                    },
                ),
                "FINAL_AMOUNT" => {
                    let subtotal = line.cost().subtotal_amount().amount().0;
                    let amount = if config.bundle_type == "CROSS_SELL" && bundle_subtotal > 0.0 {
                        let total_discount = (bundle_subtotal - value).max(0.0);
                        total_discount * (subtotal / bundle_subtotal)
                    } else {
                        let final_total = value * f64::from(*line.quantity());
                        (subtotal - final_total).max(0.0)
                    };
                    if amount <= 0.0 {
                        return None;
                    }
                    schema::ProductDiscountCandidateValue::FixedAmount(
                        schema::ProductDiscountCandidateFixedAmount {
                            amount: Decimal(amount),
                            applies_to_each_item: Some(false),
                        },
                    )
                }
                _ => schema::ProductDiscountCandidateValue::Percentage(schema::Percentage {
                    value: Decimal(value),
                }),
            };

            Some(schema::ProductDiscountCandidate {
                associated_discount_code: None,
                message: Some(format!("Cashenza {}", config.bundle_type)),
                targets: vec![schema::ProductDiscountCandidateTarget::CartLine(
                    schema::CartLineTarget {
                        id: line.id().clone(),
                        quantity: Some(*line.quantity()),
                    },
                )],
                value: discount_value,
            })
        })
        .collect::<Vec<_>>();

    if candidates.is_empty() {
        return Ok(schema::CartLinesDiscountsGenerateRunResult { operations: vec![] });
    }

    Ok(schema::CartLinesDiscountsGenerateRunResult {
        operations: vec![schema::CartOperation::ProductDiscountsAdd(
            schema::ProductDiscountsAddOperation {
                candidates,
                selection_strategy: schema::ProductDiscountSelectionStrategy::All,
            },
        )],
    })
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct BundleConfig {
    bundle_id: String,
    bundle_type: String,
    value_type: String,
    value: String,
}
